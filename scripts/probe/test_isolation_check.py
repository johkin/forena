"""Keep unavailable APIs and incomplete checks from becoming false security passes."""
import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[2]
VERIFY = runpy.run_path(str(Path(__file__).with_name('isolation-check.py')))['verify']


class IsolationEvidenceTest(unittest.TestCase):
    def setUp(self):
        with (ROOT / 'docs/migration/evidence/m22-isolation.json').open() as file:
            self.observations = json.load(file)['observations']

    def test_live_observations_pass(self):
        self.assertTrue(VERIFY(self.observations)['passed'])

    def test_unavailable_api_is_not_isolation(self):
        for index in [0, 2]:
            with self.subTest(index=index):
                changed = copy.deepcopy(self.observations)
                changed[index].update(status=503, code='PGRST002')
                with self.assertRaises(ValueError):
                    VERIFY(changed)

    def test_empty_positive_control_is_not_success(self):
        self.observations[0]['body'] = []
        with self.assertRaises(ValueError):
            VERIFY(self.observations)

    def test_empty_queue_or_missing_relation_is_not_schema_rejection(self):
        for status, code in [(200, None), (404, 'PGRST205'), (401, None)]:
            with self.subTest(status=status):
                changed = copy.deepcopy(self.observations)
                changed[2].update(status=status, code=code)
                with self.assertRaises(ValueError):
                    VERIFY(changed)

    def test_incomplete_or_duplicated_checks_rejected(self):
        for changed in [self.observations[:-1], self.observations + self.observations[:1],
                        self.observations[:2] + self.observations[2:3] * 11]:
            with self.assertRaises(ValueError):
                VERIFY(changed)

    def test_write_success_is_rejected(self):
        self.observations[1].update(status=201, code=None)
        with self.assertRaises(ValueError):
            VERIFY(self.observations)


if __name__ == '__main__':
    unittest.main()
