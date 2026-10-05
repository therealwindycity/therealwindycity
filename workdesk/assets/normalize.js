/* ============================================================================
   WorkDesk — normalize.js
   Turns *any* payload from Field Nation, WorkMarket, a CSV export, or text you
   pasted off a phone into one normalized work-order record.

   Design note (read this before "fixing" it):
   Neither platform publishes a provider-side API, so the exact JSON shape your
   browser sees can change without notice. Rather than hard-coding one shape,
   this module does BOTH:
     1. explicit adapters for the shapes that are documented / known, and
     2. a deep recursive "field sniffer" driven by alias tables, so a renamed
        or relocated field still lands in the right place.
   Every record keeps `raw` and `harvest` so a mis-mapped field can be diagnosed
   from the Diagnostics panel instead of guessed at.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { norm, hash, parseDate, iso, uniq, truncate } = WD;

  /* ------------------------------------------------------- alias tables */
  const ALIAS = {
    id:        ['id', '_id', 'work_order_id', 'workorderid', 'wo_id', 'woid', 'order_id', 'orderid',
                'assignment_id', 'assignmentid', 'job_id', 'jobid', 'gig_id', 'gigid', 'uid', 'uuid',
                'guid', 'key', 'number', 'reference', 'ref', 'post_id', 'listing_id'],
    title:     ['title', 'name', 'job_title', 'jobtitle', 'work_order_title', 'headline', 'subject',
                'summary', 'assignment_title', 'project_name', 'projectname', 'short_description',
                'label', 'position', 'role', 'work_type_name'],
    company:   ['company', 'company_name', 'companyname', 'buyer', 'buyer_name', 'buyername', 'client',
                'client_name', 'clientname', 'customer', 'customer_name', 'organization', 'organization_name',
                'org', 'org_name', 'account', 'account_name', 'business', 'business_name', 'tenant',
                'tenant_name', 'employer', 'employer_name', 'brand', 'vendor', 'contractor'],
    contact:   ['contact', 'contact_name', 'contactname', 'manager', 'manager_name', 'coordinator',
                'point_of_contact', 'poc', 'supervisor', 'site_contact'],
    description:['description', 'desc', 'details', 'detail', 'body', 'notes', 'note', 'long_description',
                'work_description', 'instructions', 'scope', 'scope_of_work', 'overview', 'content',
                'text', 'html', 'full_description', 'job_description', 'assignment_description'],
    address1:  ['address1', 'address', 'street', 'street_address', 'address_line1', 'line1', 'site_address'],
    address2:  ['address2', 'address_line2', 'line2', 'unit', 'suite'],
    city:      ['city', 'town', 'locality', 'address_city', 'site_city', 'work_city', 'municipality',
                'city_name', 'suburb'],
    state:     ['state', 'state_code', 'region', 'province', 'address_state', 'site_state', 'state_name',
                'administrative_area', 'territory'],
    zip:       ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postalcode', 'address_zip'],
    country:   ['country', 'country_code', 'nation'],
    lat:       ['lat', 'latitude', 'y'],
    lng:       ['lng', 'lon', 'long', 'longitude', 'x'],
    pay:       ['pay', 'pay_rate', 'payrate', 'rate', 'price', 'amount', 'compensation', 'pay_amount',
                'total', 'total_pay', 'fee', 'fees', 'budget', 'payout', 'hourly_rate', 'base_pay',
                'base', 'earnings', 'value', 'gross', 'offer', 'bid', 'unit_rate', 'pay_per_hour'],
    pay_type:  ['pay_type', 'paytype', 'pay_method', 'compensation_type', 'rate_type', 'type'],
    units:     ['units', 'quantity', 'qty', 'count', 'headcount', 'techs', 'technicians', 'positions',
                'openings', 'slots', 'spots'],
    start:     ['start', 'start_date', 'startdate', 'starts', 'start_time', 'starttime', 'begin',
                'begins', 'scheduled_start', 'service_start', 'work_date', 'workdate', 'date', 'due',
                'due_date', 'deadline', 'window_start', 'first_date', 'event_date'],
    end:       ['end', 'end_date', 'enddate', 'ends', 'end_time', 'endtime', 'finish', 'finishes',
                'scheduled_end', 'service_end', 'window_end', 'due_by', 'complete_by', 'expiration',
                'expires', 'expires_at', 'close_date'],
    posted:    ['posted', 'posted_at', 'postedat', 'created', 'created_at', 'createdat', 'created_on',
                'publish_date', 'published', 'published_at', 'date_created', 'timestamp', 'time',
                'submitted_at', 'opened_at', 'listed_at'],
    url:       ['url', 'link', 'href', 'permalink', 'web_url', 'weburl', 'view_url', 'viewurl',
                'detail_url', 'canonical', 'deeplink', 'deep_link', 'external_url'],
    types:     ['types_of_work', 'typesofwork', 'work_type', 'worktype', 'work_types', 'category',
                'categories', 'job_type', 'jobtype', 'skill', 'skills', 'tags', 'labels', 'keywords',
                'service_type', 'discipline', 'trade'],
    requirements:['requirements', 'requirement', 'qualifications', 'qualification', 'certifications',
                'certification', 'certs', 'must_have', 'must_haves', 'prerequisites', 'licenses'],
    status:    ['status', 'stage', 'workflow_status', 'assignment_status', 'order_status',
                'progress', 'lifecycle'],
    distance:  ['distance', 'miles', 'miles_away', 'distance_miles', 'radius'],
    duration:  ['duration', 'hours', 'estimated_hours', 'est_hours', 'length', 'time_estimate',
                'expected_hours', 'shift_length', 'work_hours']
  };

  const ALIAS_LOOKUP = {};
  Object.keys(ALIAS).forEach(field => ALIAS[field].forEach(a => { ALIAS_LOOKUP[norm(a).replace(/ /g, '')] = field; }));

  const canonKey = k => norm(k).replace(/ /g, '');

  /* ------------------------------------------------------ pay parsing */
  function parsePay(v, ctx) {
    const out = { raw: null, type: 'unknown', amount: null, min: null, max: null,
                  units: 1, currency: 'USD', unit_label: '', source: '' };
    ctx = ctx || {};

    const setType = t => { if (out.type === 'unknown' || out.type === 'flat') out.type = t; };

    if (v === null || v === undefined) {
      if (ctx.type) setType(String(ctx.type).toLowerCase().includes('hour') ? 'hourly' : 'flat');
      return out;
    }

    // ---- structured (Field Nation shape: pay.base.amount / pay.type / units)
    if (typeof v === 'object') {
      out.raw = JSON.stringify(v).slice(0, 200);
      const b = v.base || v.amount || v.rate || v.value || v;
      if (b && typeof b === 'object') {
        const amt = firstNum(b.amount, b.value, b.rate, b.money, b.usd, b.total);
        if (amt != null) out.amount = amt;
      } else {
        const amt = firstNum(b);
        if (amt != null) out.amount = amt;
      }
      const u = firstNum(v.units, v.quantity, v.qty, v.count, v.techs);
      if (u) out.units = u;
      if (v.currency) out.currency = String(v.currency).toUpperCase().slice(0, 3);
      const t = norm(v.type || v.pay_type || v.mode || '');
      if (t.includes('hour')) setType('hourly');
      else if (t.includes('unit') || t.includes('each')) setType('per_unit');
      else if (t.includes('fixed') || t.includes('flat')) setType('flat');
      out.source = 'structured';
      return out;
    }

    // ---- numeric
    if (typeof v === 'number') {
      out.amount = v; out.raw = String(v);
      if (ctx.type && /hour/i.test(String(ctx.type))) setType('hourly');
      out.source = 'numeric';
      return out;
    }

    // ---- string: "$150 flat", "$25 - $35/hr", "150 USD", "up to $400"
    let s = String(v).trim();
    out.raw = s.slice(0, 200);
    if (!s) { out.source = 'empty'; return out; }
    if (/€/.test(s)) out.currency = 'EUR';
    if (/£/.test(s)) out.currency = 'GBP';
    if (/CAD|\$?\bcanadian\b/i.test(s)) out.currency = 'CAD';

    const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n));
    if (/per\s*hour|\/\s*hr|\/\s*h\b|\bhourly\b|\bhr\b|\bh r\b/i.test(s)) setType('hourly');
    if (/per\s*(unit|each|device|site|stop)|\/\s*(unit|ea)\b|\beach\b/i.test(s)) setType('per_unit');
    if (/\bflat\b|\bfixed\b|\btotal\b|\blump\b|\bproject\b/i.test(s)) setType('flat');
    if (nums.length >= 2 && /[-–—]|to|\band\b/i.test(s) && Math.abs(nums[1] - nums[0]) < nums[0] * 5) {
      out.min = Math.min(nums[0], nums[1]); out.max = Math.max(nums[0], nums[1]);
      out.amount = (out.min + out.max) / 2;
    } else if (nums.length >= 1) {
      // ignore a leading "up to"/"as low as" second number
      out.amount = /up to/i.test(s) ? nums[nums.length - 1] : nums[0];
      if (out.amount && /up to/i.test(s) && nums.length > 1) out.max = out.amount, out.amount = nums[0];
    }
    const um = s.match(/\bx\s*(\d+)\b|\b(\d+)\s*(?:techs?|positions?|units|people|slots)\b/i);
    if (um) out.units = parseInt(um[1] || um[2], 10) || 1;
    const ul = s.match(/per\s+([a-z]+)/i);
    if (ul) out.unit_label = ul[1].toLowerCase();
    out.source = 'string';
    return out;
  }

  function firstNum() {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (typeof v === 'number' && !isNaN(v)) return v;
      if (typeof v === 'string') {
        const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        if (m) return parseFloat(m[0]);
      }
    }
    return null;
  }

  /* ------------------------------------------------- deep field sniffer */
  function sniff(obj, opts) {
    const o = opts || {};
    const maxDepth = o.maxDepth == null ? 6 : o.maxDepth;
    const found = {};                    // field -> {value, depth, path}
    const seen = new Set();

    function walk(node, depth, path) {
      if (depth > maxDepth || node === null || node === undefined) return;
      if (typeof node !== 'object') return;
      if (seen.has(node)) return; seen.add(node);
      if (seen.size > 4000) return;

      if (Array.isArray(node)) {
        // don't dive into big arrays of primitives (descriptions, tag clouds)
        if (node.length && typeof node[0] === 'object') node.slice(0, 25).forEach((n, i) => walk(n, depth + 1, path + '[' + i + ']'));
        return;
      }

      for (const k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        const v = node[k];
        const ck = canonKey(k);
        const field = ALIAS_LOOKUP[ck];
        if (field && v !== null && v !== undefined && v !== '') {
          // Scalars always usable. Objects/arrays are usable too — textOf() and
          // listOf() know how to pull a leaf out of {name:…}, {html:…}, {utc:…},
          // [{id,name}] etc. We only refuse things that are clearly containers
          // (huge objects / huge arrays) so a wrapper can't shadow a real value.
          const usable = (typeof v !== 'object')
            || (!Array.isArray(v) && Object.keys(v).length <= 12)
            || (Array.isArray(v) && v.length <= 40 && field !== 'description');
          const prev = found[field];
          if (usable && (!prev || depth < prev.depth)) {
            found[field] = { value: v, depth, path: path + '.' + k };
          }
        }
        if (typeof v === 'object') walk(v, depth + 1, path + '.' + k);
      }
    }
    walk(obj, 0, '');
    const flat = {};
    Object.keys(found).forEach(f => { flat[f] = found[f].value; found[f] && (flat['__path_' + f] = found[f].path); });
    return flat;
  }

  function textOf(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(', ');
    if (typeof v === 'object') {
      // Field Nation: description.html ; WorkMarket-ish: {text: ...}
      const t = v.html || v.text || v.utc || v.iso || v.value || v.plain || v.markdown || v.body ||
                v.name || v.label || v.title || v.formatted || v.display || v.date || v.string;
      if (t !== undefined && t !== null && t !== '') return textOf(t);
      const keys = Object.keys(v);
      if (keys.length === 1) return textOf(v[keys[0]]);
      if (keys.length && keys.length <= 12) return keys.map(k => textOf(v[k])).filter(Boolean).join(' | ');
      try { return JSON.stringify(v); } catch (_) { return ''; }
    }
    return '';
  }

  function listOf(v) {
    if (v === null || v === undefined) return [];
    if (Array.isArray(v)) return v.map(x => (typeof x === 'object' ? (textOf(x.name || x.title || x.label || x.value) || textOf(x)) : String(x))).filter(Boolean);
    if (typeof v === 'string') return v.split(/[,;|]|\s{2,}|\n/).map(s => s.trim()).filter(Boolean);
    return [textOf(v)].filter(Boolean);
  }

  /* --------------------------------------------------------- the record */
  function blankOrder() {
    return {
      schema: WD.SCHEMA,
      id: '', dedupe: '', platform: 'unknown',
      title: '', company: '', contact: '',
      description: '', description_html: '',
      address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
      lat: null, lng: null, geo_precision: null,
      pay: { raw: null, type: 'unknown', amount: null, min: null, max: null, units: 1, currency: 'USD', unit_label: '' },
      hourly: null, hourly_basis: null,
      start: null, end: null, posted_at: null,
      work_types: [], skills: [], requirements: [],
      status: 'available',
      url: '', apply_url: '',
      distance_mi: null, drive_min: null,
      source: 'unknown', captured_at: null,
      harvest: { method: '', page_url: '', ok: true, notes: '', fields: {} },
      raw: null,
      my: { state: 'open', applied_at: null, pitch: '', note: '', outcome: null, saved_at: null, ignored_at: null, seen_at: null, followups: [] }
    };
  }

  /* ------------------------------------------------------- deep linking */
  const LINKS = {
    fieldnation: {
      home:  'https://app.fieldnation.com/',
      order: id => 'https://app.fieldnation.com/workorder/' + encodeURIComponent(id),
      search:'https://app.fieldnation.com/work',
      login: 'https://app.fieldnation.com/login'
    },
    workmarket: {
      home:  'https://app.workmarket.com/',
      order: id => 'https://app.workmarket.com/assignments/' + encodeURIComponent(id),
      search:'https://app.workmarket.com/contributor/assignments',
      login: 'https://app.workmarket.com/login'
    }
  };

  function buildUrls(o) {
    const L = LINKS[o.platform];
    if (!L) return;
    const bareId = String(o.id || '').trim();
    if (!o.url && bareId) o.url = L.order(bareId);
    if (!o.url) o.url = L.search;
    if (!o.apply_url) o.apply_url = o.url;
  }

  /* --------------------------------------------------- platform detect */
  // An explicit tag ON A RECORD outranks everything — including a caller-supplied
  // default platform (loadSample, an import preset). Without this, one mixed feed
  // gets re-labelled as a single platform and the board loses its split view.
  function tagPlatform(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
    const tag = obj._platform || obj.platform || obj.source_platform || obj.vendor;
    if (!tag) return '';
    const t = String(tag).toLowerCase();
    if (/field/.test(t)) return 'fieldnation';
    if (/work\s*market|work_market|^wm/.test(t)) return 'workmarket';
    return '';
  }

  function detectPlatform(obj, hint) {
    const isRec = obj && typeof obj === 'object' && !Array.isArray(obj);

    // 1. an explicit tag ON THE RECORD always wins (the sample board and any
    //    hand-labelled import use it; worker/poll.py writes it too). It has to
    //    beat an inherited hint, or one Field Nation row in a mixed feed would
    //    re-label the whole batch.
    if (isRec) {
      const tag = obj._platform || obj.platform || obj.source_platform || obj.vendor;
      if (tag) {
        const t = String(tag).toLowerCase();
        if (/field/.test(t)) return 'fieldnation';
        if (/work\s*market|work_market|^wm/.test(t)) return 'workmarket';
      }
    }

    // 2. then the caller's hint (from the envelope key, e.g. ".assignments")
    const h = String(hint || '').toLowerCase();
    if (/fieldnation|field_nation|\bfn\b/.test(h)) return 'fieldnation';
    if (/workmarket|work_market|\bwm\b/.test(h)) return 'workmarket';
    if (!isRec) return 'unknown';

    // 3. WorkDesk's own id convention
    const id = String(obj.id || obj._id || obj.work_order_id || obj.assignment_id || '').toLowerCase();
    if (/^wm[-_:]/.test(id)) return 'workmarket';
    if (/^fn[-_:]/.test(id)) return 'fieldnation';

    let s = '';
    try { s = JSON.stringify(obj).slice(0, 20000).toLowerCase(); } catch (e) { s = ''; }
    if (/fieldnation|field_nation|workorder|work_order|types_of_work|fndev/.test(s)) return 'fieldnation';
    if (/workmarket|work_market|labor_cloud|laborcloud/.test(s)) return 'workmarket';
    if (/assignment/.test(s)) return 'workmarket';
    return 'unknown';
  }

  // The array's own key is a strong platform signal: ".workorders" vs ".assignments"
  function pathHint(path) {
    const p = String(path || '').toLowerCase();
    if (/workorder|work_order/.test(p)) return 'fieldnation';
    if (/assignment/.test(p)) return 'workmarket';
    return null;
  }

  /* --------------------------------------------------- master normalize */
  function normalizeOne(input, opts) {
    const o = opts || {};
    const flat = sniff(input);
    const rec = blankOrder();

    rec.platform = tagPlatform(input) || o.platform || detectPlatform(input, o.hint);
    rec.source   = o.source || 'import';
    rec.captured_at = iso(new Date());
    rec.harvest.method  = o.method || 'unknown';
    rec.harvest.page_url = o.pageUrl || (typeof location !== 'undefined' ? location.href : '');
    rec.harvest.fields   = Object.keys(flat).filter(k => !k.startsWith('__')).sort();

    rec.id      = textOf(flat.id).slice(0, 80);
    rec.title   = textOf(flat.title).trim() || textOf(flat.types).split(',')[0] || '';
    rec.company = textOf(flat.company).trim();
    rec.contact = textOf(flat.contact).trim();

    const dRaw = flat.description;
    rec.description_html = (dRaw && typeof dRaw === 'object' && dRaw.html) ? String(dRaw.html) : '';
    rec.description = textOf(dRaw).replace(/\s+/g, ' ').trim();
    if (!rec.description && rec.description_html) rec.description = rec.description_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    rec.address1 = textOf(flat.address1).trim();
    rec.address2 = textOf(flat.address2).trim();
    rec.city     = textOf(flat.city).trim();
    rec.state    = textOf(flat.state).trim().toUpperCase().slice(0, 2) || '';
    rec.zip      = textOf(flat.zip).trim();
    rec.country  = textOf(flat.country).trim().toUpperCase().slice(0, 2) || 'US';
    rec.lat = firstNum(flat.lat); rec.lng = firstNum(flat.lng);

    rec.pay = parsePay(flat.pay, { type: flat.pay_type });
    if (rec.pay.units <= 1) { const u = firstNum(flat.units); if (u) rec.pay.units = u; }

    rec.start     = iso(parseDate(textOf(flat.start)));
    rec.end       = iso(parseDate(textOf(flat.end)));
    rec.posted_at = iso(parseDate(textOf(flat.posted)));
    rec.status    = textOf(flat.status).toLowerCase().slice(0, 40) || 'available';

    rec.work_types   = uniq(listOf(flat.types)).slice(0, 20);
    rec.requirements = uniq(listOf(flat.requirements)).slice(0, 30);
    rec.skills       = uniq(rec.work_types.concat(extractSkills(rec.title + ' ' + rec.description))).slice(0, 25);

    const explicitDistance = firstNum(flat.distance);
    rec.duration_hint = firstNum(flat.duration);

    rec.url = textOf(flat.url).trim();
    buildUrls(rec);

    // geo + distance
    const geo = WD.geocode(rec);
    if (geo) {
      if (rec.lat == null) { rec.lat = geo.lat; rec.lng = geo.lng; }
      rec.geo_precision = geo.precision;
    }
    rec.distance_mi = null;
    if (explicitDistance != null && explicitDistance >= 0 && explicitDistance < 6000) {
      rec.distance_mi = explicitDistance;
    } else if (geo) {
      const home = (o.home && o.home.lat != null) ? o.home
                 : (WD.DEFAULT_PROFILE && WD.DEFAULT_PROFILE.home);
      if (home && home.lat != null) {
        const mi = WD.haversineMiles(home, geo);
        rec.distance_mi = mi == null ? null : WD.roadMiles(mi);
        rec.drive_min = rec.distance_mi == null ? null : WD.driveMinutes(rec.distance_mi);
        if (!o.home) rec.harvest.notes = ((rec.harvest.notes || '') + ' distance used the default base; set yours in Setup').trim();
      }
    }
    rec.drive_min = rec.distance_mi == null ? null : WD.driveMinutes(rec.distance_mi);

    // hourly estimate
    rec.hourly = null; rec.hourly_basis = null;
    if (rec.pay.amount != null) {
      if (rec.pay.type === 'hourly') { rec.hourly = rec.pay.amount; rec.hourly_basis = 'stated hourly rate'; }
      else {
        const winHours = WD.hoursBetween(rec.start, rec.end);
        const guess = winHours && winHours > 0.25 && winHours < 200 ? winHours : rec.duration_hint;
        if (guess) { rec.hourly = rec.pay.amount / guess; rec.hourly_basis = 'pay ÷ ' + (Math.round(guess * 10) / 10) + 'h ' + (winHours ? 'from the posted window' : 'from the posted duration'); }
      }
      if (rec.hourly == null) {
        rec.hourly_basis = 'needs your typical job length';
      }
    }

    // dedupe key
    const basis = [rec.platform, rec.id || '', norm(rec.title), norm(rec.city), rec.state,
                   rec.start || '', rec.pay.raw || rec.pay.amount || ''].join('|');
    rec.dedupe = (rec.platform || 'unk') + ':' + (rec.id ? WD.hash(rec.platform + ':' + rec.id) : WD.hash(basis));

    rec.raw = o.keepRaw === false ? null : input;
    if (!rec.title && !rec.company && !rec.city) return null;   // junk
    return rec;
  }

  /* ------------------------------------------- payload -> [orders] */
  function findOrderArrays(payload, out, depth, path) {
    out = out || []; depth = depth || 0; path = path || '';
    if (depth > 6 || payload === null || typeof payload !== 'object') return out;
    if (Array.isArray(payload)) {
      if (payload.length && payload.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
        out.push({ path: path || '(root)', items: payload });
      }
      payload.slice(0, 50).forEach((x, i) => findOrderArrays(x, out, depth + 1, path + '[' + i + ']'));
      return out;
    }
    for (const k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) findOrderArrays(payload[k], out, depth + 1, path + '.' + k);
    }
    return out;
  }

  const ORDERISH = /work_?order|assignment|listing|gig|job|opportunit|search_?result|posting|project|shift/i;

  function normalizePayload(payload, opts) {
    const o = Object.assign({ source: 'import', keepRaw: true }, opts || {});
    const out = [];
    // one detection pass over the whole envelope, so children of
    // {assignments:[...]} inherit "workmarket" even though the child object
    // itself never says the word.
    if (!o.platform && !o.hint && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const g = detectPlatform(payload);
      if (g !== 'unknown') o.hint = g;
    }

    // single object that looks like one order
    const looksLikeOne = payload && typeof payload === 'object' && !Array.isArray(payload) &&
      (payload.title || payload.name || payload.description || payload.pay || payload.location);

    if (looksLikeOne && findOrderArrays(payload).filter(a => a.items.length > 1).length === 0) {
      const r = normalizeOne(payload, o); if (r) out.push(r);
      return out;
    }

    if (Array.isArray(payload)) {
      payload.forEach(x => { const r = normalizeOne(x, o); if (r) out.push(r); });
      if (out.length) return out;
    }

    // hunt for the array that most looks like a list of work orders
    const cands = findOrderArrays(payload).filter(a => a.items.length);
    cands.sort((a, b) => scoreArray(b) - scoreArray(a));
    function scoreArray(c) {
      let s = c.items.length;
      if (ORDERISH.test(c.path)) s += 25;
      const sample = c.items.slice(0, 5);
      const withTitle = sample.filter(x => textOf(x && (x.title || x.name))).length;
      const withPay   = sample.filter(x => x && (x.pay != null || x.rate != null || x.amount != null)).length;
      const withLoc   = sample.filter(x => x && (x.city || x.location || x.address)).length;
      return s + withTitle * 12 + withPay * 10 + withLoc * 8;
    }
    for (const c of cands) {
      const hint = pathHint(c.path) || o.hint;
      const childOpts = hint ? Object.assign({}, o, { hint }) : o;
      c.items.forEach(x => { const r = normalizeOne(x, childOpts); if (r) out.push(r); });
      if (out.length >= 2) break;   // first productive candidate wins
    }
    return out;
  }

  /* ------------------------------------------------------------ CSV */
  function parseCSV(text, delim) {
    const rows = []; let row = [], cell = '', q = false;
    const d = delim || ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }

  function normalizeCSV(text, opts) {
    const o = Object.assign({ source: 'csv' }, opts || {});
    const t = String(text || '').trim();
    if (!t) return [];
    const delim = (t.match(/\t/g) || []).length > (t.match(/,/g) || []).length / 2 ? '\t' :
                  ((t.match(/;/g) || []).length > (t.match(/,/g) || []).length ? ';' : ',');
    const rows = parseCSV(t, delim);
    if (rows.length < 2) return [];
    const head = rows[0].map(h => canonKey(h));
    const objs = rows.slice(1).map(r => {
      const x = {}; head.forEach((h, i) => { if (h) x[h] = r[i]; }); return x;
    });
    return normalizePayload(objs, o);
  }

  /* ------------------------------------------- pasted free text */
  // Handles the common case of copying 1-20 listings out of a phone browser:
  //   "POS Refresh - Denver, CO - $150 flat - Starts Jul 15"
  function normalizePasted(text, opts) {
    const o = Object.assign({ source: 'pasted' }, opts || {});
    const blocks = String(text || '')
      .split(/\n\s*\n|(?=^\s*\d{1,3}[.)]\s)/m)
      .map(b => b.trim()).filter(b => b.length > 8);

    // no hyphen/digit in the city group, and the two letters must be a real
    // state/province code — otherwise "POS Refresh - Denver, CO" yields
    // "Refresh - Denver" as the city.
    const CITY_STATE = /([A-Z][A-Za-z.'\u2019 ]{1,28}),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/g;
    const out = [];

    blocks.forEach((b, idx) => {
      const rec = blankOrder();
      rec.source = 'pasted'; rec.captured_at = iso(new Date());
      rec.harvest.method = 'paste'; rec.harvest.notes = 'block ' + (idx + 1);

      const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
      rec.title = (lines[0] || b.split(/[|\-–—]/)[0] || '').replace(/^\s*\d{1,3}[.)]\s*/, '').trim().slice(0, 160);

      const hits = b.match(CITY_STATE) ? b.match(CITY_STATE) : [];
      let chosen = null;
      const rawMatches = [];
      const re = new RegExp(CITY_STATE.source, 'g');
      let mm;
      while ((mm = re.exec(b)) !== null) rawMatches.push(mm);
      for (const m of rawMatches) {
        if (WD.STATE_CODES && WD.STATE_CODES[m[2]] && WD.lookupCity(m[1], m[2])) { chosen = m; break; }
      }
      if (!chosen) chosen = rawMatches.find(m => WD.STATE_CODES && WD.STATE_CODES[m[2]]) || rawMatches[0];
      if (chosen) { rec.city = chosen[1].trim(); rec.state = chosen[2]; rec.zip = chosen[3] || ''; }

      const pm = b.match(/\$\s?\d[\d,]*(?:\.\d+)?(?:\s*[-–]\s*\$?\s?\d[\d,]*(?:\.\d+)?)?\s*(?:\/\s*(?:hr|hour)|per hour|flat|fixed|each)?/i);
      if (pm) rec.pay = parsePay(pm[0]);

      const dm = b.match(/\b(?:starts?|on|scheduled|window)\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{2,4})?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (dm) rec.start = iso(parseDate(dm[1]));

      rec.description = b.replace(rec.title, '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      rec.platform = o.platform || 'unknown';
      // pasted text carries no platform tag; leave a note so the board can say why
      rec.harvest.notes = ((rec.harvest.notes || '') + ' pasted text: platform not detected').trim();
      rec.skills = extractSkills(b);
      buildUrls(rec);
      const geo = WD.geocode(rec);
      if (geo && rec.lat == null) { rec.lat = geo.lat; rec.lng = geo.lng; rec.geo_precision = geo.precision; }
      if (geo) {
        const home = (o.home && o.home.lat != null) ? o.home
                   : (WD.DEFAULT_PROFILE && WD.DEFAULT_PROFILE.home);
        const mi = home && home.lat != null ? WD.haversineMiles(home, geo) : null;
        rec.distance_mi = mi == null ? null : WD.roadMiles(mi);
        rec.drive_min = rec.distance_mi == null ? null : WD.driveMinutes(rec.distance_mi);
      }
      rec.dedupe = (rec.platform || 'unk') + ':' + WD.hash(norm(rec.title) + '|' + norm(rec.city) + '|' + rec.state);
      rec.raw = { text: b.slice(0, 2000) };
      if (rec.title) out.push(rec);
    });
    return out;
  }

  /* ------------------------------------------------- skill extraction */
  const SKILL_WORDS = [
    'cabling','cat5','cat5e','cat6','cat6a','fiber','splice','splicing','otdr','fluke','network','switch',
    'router','firewall','rj45','patch panel','structured cabling','low voltage','pos','point of sale','kiosk',
    'tablet','handheld','scanner','printer','label printer','thermal','server','rack','rack and stack',
    'decommission','refresh','migration','upgrade','install','installation','swap','break fix','breakfix',
    'atm','kiosk','digital signage','menu board','drive thru','drivethru','camera','cctv','surveillance','access control',
    'ap','wireless','wifi','wi-fi','wlan','antenna','das','small cell','5g','lte','verizon','at&t','t-mobile',
    'sprint','dish','coax','rg6','rg11','fiber optic','single mode','multimode','fusion splicing','cleave',
    'electric','electrical','conduit','hvac','plumbing','appliance','refrigeration','washer','dryer','dishwasher',
    'vending','slot','gaming','casino','marquee','led','lcd','tv mount','sound bar','sonos','home theater',
    'smart home','ring','nest','thermostat','doorbell','ev charger','solar','battery','inverter','generator',
    'forklift','scissor lift','boom lift','ladder','roof','attic','crawl space','basement','survey','photos',
    'audit','inventory','merchandising','reset','planogram','shelf','signage','pallet','freight','delivery',
    'courier','moving','haul','cleanup','janitorial','pressure wash','landscaping','fence','deck','drywall',
    'paint','painting','flooring','tile','carpet','countertop','cabinet','granite','quartz','demo','demolition'
  ];
  const SKILL_RE = new RegExp('\\b(' + SKILL_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  function extractSkills(text) {
    const s = String(text || '');
    const hits = s.match(SKILL_RE) || [];
    return uniq(hits.map(h => h.toLowerCase())).slice(0, 25);
  }

  /* ------------------------------------------------------- smart entry */
  function ingestAnything(input, opts) {
    const o = opts || {};
    if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return [];
      if (s[0] === '{' || s[0] === '[') {
        try { return normalizePayload(JSON.parse(s), o); } catch (e) { /* fall through */ }
      }
      if (/[,\t;]/.test(s) && s.split('\n').length > 1 && /^["a-z0-9]/i.test(s)) return normalizeCSV(s, o);
      return normalizePasted(s, o);
    }
    if (input && typeof input === 'object') return normalizePayload(input, o);
    return [];
  }

  /* ------------------------------------------------------- merge/dedupe */
  function merge(existing, incoming) {
    const map = new Map();
    (existing || []).forEach(r => map.set(r.dedupe, r));
    let added = 0, updated = 0;
    (incoming || []).forEach(n => {
      const prev = map.get(n.dedupe);
      if (!prev) { map.set(n.dedupe, n); added++; return; }
      // keep my tracking state + first-seen; refresh everything the platform owns
      const keep = prev.my;
      const firstSeen = prev.harvest.first_seen || prev.captured_at;
      Object.assign(prev, n, { my: keep });
      prev.harvest.first_seen = firstSeen;
      prev.harvest.last_seen = n.captured_at;
      prev.harvest.seen_count = (prev.harvest.seen_count || 1) + 1;
      updated++;
    });
    return { rows: Array.from(map.values()), added, updated };
  }

  Object.assign(WD, {
    ALIAS, ALIAS_LOOKUP, canonKey,
    parsePay, firstNum, sniff, textOf, listOf,
    blankOrder, normalizeOne, normalizePayload, normalizeCSV, normalizePasted,
    parseCSV, extractSkills, ingestAnything, merge,
    findOrderArrays, detectPlatform, tagPlatform, buildUrls, LINKS
  });
})(typeof window !== 'undefined' ? window : globalThis);
