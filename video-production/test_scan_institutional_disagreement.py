import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import scan_institutional_disagreement as scan


class DisagreementScannerTests(unittest.TestCase):
    def test_timestamp_conversion_and_wrapped_cues(self):
        cues = scan.parse_cues("[00:01:02] First line\ncontinued\n[01:00:00] Second")
        self.assertEqual(cues[0]["seconds"], 62)
        self.assertEqual(cues[0]["text"], "First line continued")
        self.assertEqual(cues[1]["seconds"], 3600)

    def test_explicit_disagreement_is_found(self):
        hits = scan.explicit_disagreement_matches("I respectfully disagree with the recommendation.")
        self.assertTrue(hits)
        self.assertEqual(hits[0]["category"], "explicit_disagreement_language")

    def test_negated_disagreement_is_not_classified_as_opposition(self):
        self.assertEqual(scan.explicit_disagreement_matches("I don't disagree with Mr. Miller."), [])
        self.assertEqual(
            scan.explicit_disagreement_matches("I haven't seen anything that I disagreed with."), []
        )
        self.assertEqual(
            scan.explicit_disagreement_matches("I'm not here to say or to disagree with this ordinance."), []
        )
        self.assertEqual(scan.explicit_disagreement_matches("I don't think I disagree with staff."), [])
        later = scan.explicit_disagreement_matches(
            "I don't think I disagree. I respectfully disagree with staff."
        )
        self.assertTrue(any(hit["text"].startswith("I respectfully disagree") for hit in later))

    def test_miller_lane_and_a_different_miller_are_not_target_references(self):
        self.assertEqual(scan.person_mentions_miller("Miller Lane is under construction."), [])
        self.assertEqual(scan.person_mentions_miller("Brandt Miller raised a point."), [])
        self.assertTrue(scan.person_mentions_miller("Mr. Miller raised a point."))
        self.assertTrue(scan.person_mentions_miller("Charles Miller raised a point."))

    def test_generic_agreement_is_not_direct_miller_support(self):
        self.assertIsNone(scan.MILLER_DIRECT_SUPPORT_RE.search("You're right."))
        self.assertIsNone(scan.MILLER_DIRECT_SUPPORT_RE.search("I agree with him."))
        self.assertIsNone(scan.NEARBY_SUPPORT_RE.search("Exactly."))
        self.assertIsNone(scan.NEARBY_SUPPORT_RE.search("I agree."))

    def test_explicit_named_support_matches(self):
        cues = [{"text": "I agree with Charles Miller's position."}]
        info = scan.find_support_match(cues, 0, {0})
        self.assertEqual(info["pattern"], "explicit_named_support")
        self.assertIsNotNone(scan.MILLER_DIRECT_SUPPORT_RE.search("Mr. Miller was right."))

    def test_same_cue_self_reference_does_not_become_support(self):
        cues = [{"text": "Charles Miller, for the record. You are right to ask."}]
        self.assertIsNone(scan.find_support_match(cues, 0, {0}))

    def test_response_phrase_must_point_to_the_named_miller_cue(self):
        cues = [
            {"text": "Mr. Miller made a statement."},
            {"text": "You're right."},
        ]
        info = scan.find_support_match(cues, 1, {0})
        self.assertEqual(info["pattern"], "response_phrase_after_miller_name_in_preceding_cue")

        unrelated = [
            {"text": "The chair asked for a vote."},
            {"text": "You're right."},
            {"text": "Mr. Miller spoke later."},
        ]
        self.assertIsNone(scan.find_support_match(unrelated, 1, {2}))

    def test_negative_agreement_is_not_support(self):
        cues = [{"text": "I agree with you that Mr. Miller was out of order."}]
        self.assertIsNone(scan.find_support_match(cues, 0, {0}))

    def test_time_limit_call_does_not_suppress_a_response_candidate(self):
        cues = [{"text": "I find that you're right. Your time is up, Mr. Miller."}]
        info = scan.find_support_match(cues, 0, {0})
        self.assertEqual(info["pattern"], "response_phrase_before_miller_name_in_same_cue")

    def test_brandt_miller_does_not_anchor_a_support_candidate(self):
        cues = [{"text": "You're right, Brandt Miller."}]
        self.assertIsNone(scan.find_support_match(cues, 0, set()))

    def test_correction_phrase_is_a_candidate_not_a_finding(self):
        matches = scan.correction_phrase_matches("I need to correct the record.")
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].group(0).lower(), "i need to correct the record")
        self.assertEqual(len(scan.correction_phrase_matches("The map is not accurate.")), 1)

    def test_confirmation_questions_and_self_hedges_are_not_corrections(self):
        examples = (
            "Is that not correct?",
            "Am I correct that the buffer is not required?",
            "I'm assuming that's wrong. I wanted to verify.",
            "Unless I'm incorrect, the zone allows duplex use.",
            "If any of my numbers are incorrect, please let me know.",
            "If we knew something was wrong, what would we do?",
        )
        for text in examples:
            with self.subTest(text=text):
                self.assertEqual(scan.correction_phrase_matches(text), [])


if __name__ == "__main__":
    unittest.main()
