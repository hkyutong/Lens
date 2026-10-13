import json
import unittest

from crazy_functions.lens_research_tasks import (
    TASKS,
    TaskResultError,
    _parse_json,
    prepare_input,
    strict_model_request,
    validate_and_render,
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

    def test_all_retry_examples_satisfy_the_task_contract(self):
        material = (
            "Paper: Synthetic A\nRainfall is associated with plant height.\n\n"
            "Paper: Synthetic B\nSoil moisture may confound this association."
        )
        for key, spec in TASKS.items():
            with self.subTest(task=key):
                value = material
                if key == "Lens｜审稿意见应答":
                    value = "1. Explain the measurements.\n2. Discuss confounding.\n\n" + material
                task_input = prepare_input(key, value)
                prompt = strict_model_request(spec, task_input)
                example = prompt.split("完整输出示例（必须保留 rows 数量，不能返回空数组）：\n", 1)[1].split("\n任务：", 1)[0]
                report = validate_and_render(spec, task_input, example)
                self.assertIn(spec.title, report)
                self.assertIn(spec.instruction, prompt)
                rows = json.loads(example).get("rows", [])
                expected_status = "proposal" if key == "Lens｜研究方案设计" else "missing"
                self.assertTrue(all(row["status"] == expected_status for row in rows))
                if key == "Lens｜研究方案设计":
                    self.assertTrue(rows[0]["refs"])
                    self.assertTrue(all(
                        set(ref) == {"source_id", "quote"}
                        for row in rows for ref in row["refs"]
                    ))
                else:
                    self.assertTrue(all(row["refs"] == [] for row in rows))
                if spec.fields:
                    self.assertIn("顶层只能有 rows", prompt)
                    self.assertIn("不得翻译或另加包装层", prompt)

    def test_retry_example_cannot_invent_a_paper_identifier(self):
        key = "Lens｜比较多篇论文"
        task_input = prepare_input(key, "Paper: A\nFirst synthetic source.\n\nPaper: B\nSecond synthetic source.")
        prompt = strict_model_request(TASKS[key], task_input)
        example = json.loads(prompt.split("完整输出示例（必须保留 rows 数量，不能返回空数组）：\n", 1)[1].split("\n任务：", 1)[0])
        example["rows"][0]["paper_id"] = "invented"
        with self.assertRaises(TaskResultError):
            validate_and_render(TASKS[key], task_input, json.dumps(example))


if __name__ == '__main__':
    unittest.main()
