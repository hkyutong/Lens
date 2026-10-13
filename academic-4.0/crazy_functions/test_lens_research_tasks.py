import unittest

from crazy_functions.lens_research_tasks import (
    TASKS,
    _parse_json,
    prepare_input,
    strict_model_request,
)


class LensResearchTaskJsonTests(unittest.TestCase):
    def test_extracts_json_after_model_preface(self):
        result = _parse_json('结果如下：\n{"rows": []}\n以上为结构化结果。')
        self.assertEqual(result, {"rows": []})

    def test_keeps_strict_failure_for_non_object_output(self):
        with self.assertRaises(Exception):
            _parse_json('结果如下：\n["不是对象"]')

    def test_retry_request_explicitly_requires_parseable_json(self):
        task_input = prepare_input(
            "Lens｜研究设计体检",
            "请检查阅读时间与理解成绩关系的研究设计，并标注缺失证据。",
        )
        prompt = strict_model_request(TASKS["Lens｜研究设计体检"], task_input)
        self.assertIn("JSON.parse", prompt)
        self.assertIn("禁止 Markdown", prompt)
        self.assertIn("rows 不可为空", prompt)
        self.assertIn("完整输出示例", prompt)
        self.assertIn('"dimension": "question"', prompt)
        self.assertLess(len(prompt), 1800)


if __name__ == '__main__':
    unittest.main()
