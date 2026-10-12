"""Regression checks for high-risk public-comment candidate patterns."""
import unittest

import scan_public_comment_comparators as scanner


class ComparatorPatternTests(unittest.TestCase):
    def test_three_minute_rule_is_a_candidate(self):
        text = "We will limit public comment to three minutes."
        self.assertIsNotNone(scanner.COMMENT_CAP_RE.search(text))

    def test_microphone_instruction_is_not_a_comment_cap(self):
        text = "If you can speak right into that microphone for us."
        self.assertIsNone(scanner.COMMENT_CAP_RE.search(text))

    def test_one_speech_per_person_is_a_candidate(self):
        text = "Each person may speak once on this item."
        self.assertIsNotNone(scanner.COMMENT_CAP_RE.search(text))

    def test_one_time_for_everybody_is_a_candidate(self):
        text = "We're just gonna have one time for everybody."
        self.assertIsNotNone(scanner.COMMENT_CAP_RE.search(text))

    def test_already_spoken_gate_is_a_candidate(self):
        text = "Have you already spoken on this issue?"
        self.assertIsNotNone(scanner.COMMENT_CAP_RE.search(text))

    def test_public_comment_opportunity_range(self):
        cues = [
            {"text": "The application is approved with those five to six"},
            {"text": "different opportunities for public comment."},
        ]
        match = scanner.match_current_or_crossing(scanner.COMMENT_OPPORTUNITY_RE, cues, 0)
        self.assertIsNotNone(match)
        self.assertEqual(match.group(0), "five to six different opportunities for public comment")
        self.assertIsNone(scanner.match_current_or_crossing(scanner.COMMENT_OPPORTUNITY_RE, cues, 1))

    def test_rejects_addressed_official_as_self_identification(self):
        text = "For the record, Councilman Crave, can you hear me?"
        self.assertEqual(scanner.extract_names(text), [])
        self.assertEqual(scanner.extract_names("Commissioner Leard chair through you."), [])

    def test_extracts_caption_name_and_excludes_miller(self):
        text = "My name is Dante Rushton. Charles Miller is already on the list."
        self.assertEqual(scanner.extract_names(text), ["Dante Rushton"])

    def test_owner_reference_is_not_an_applicant_role(self):
        text = "There have been five owner requested annexations."
        self.assertIsNone(scanner.APPLICANT_ROLE_RE.search(text))

    def test_advocacy_coalition_is_not_assumed_to_be_an_applicant(self):
        text = "I am speaking on behalf of the Cheyenne Area Landowners Coalition."
        self.assertIsNone(scanner.APPLICANT_ROLE_RE.search(text))
        self.assertIsNone(scanner.AFFILIATION_TO_ENTITY_RE.search(text))

    def test_negated_company_affiliation_is_not_positive(self):
        text = "I am not associated with Microsoft. I am just a resident."
        self.assertIsNone(scanner.AFFILIATION_TO_ENTITY_RE.search(text))

    def test_positive_company_representation_is_a_candidate(self):
        text = "My name is Cindy Dansancy. I'm here on behalf of uh Via West Skybox."
        self.assertIsNotNone(scanner.AFFILIATION_TO_ENTITY_RE.search(text))

    def test_role_mention_later_in_comment_is_not_linked_to_speaker(self):
        cues = [{
            "text": "My name is Patricia McCoy. I support this. We should contact the owner of the property."
        }]
        self.assertFalse(scanner.applicant_role_near_identification(cues, 0))

    def test_project_agent_identification_is_linked(self):
        cues = [{"text": "Good evening. John Sers, agent for True Great Land Development."}]
        self.assertTrue(scanner.applicant_role_near_identification(cues, 0))


if __name__ == "__main__":
    unittest.main()
