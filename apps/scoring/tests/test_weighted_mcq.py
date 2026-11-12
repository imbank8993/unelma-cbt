"""PG berbobot (metadata.option_scoring = "weighted"), mis. TKP pada SKD CPNS."""

from app.schemas.grading import GradeBatchItem, GradeBatchRequest, Question
from app.routers.grading import grade_attempt
from app.services.grading import calculate_single_answer_score

OPTIONS = [
    {"id": "a", "option_text": "A", "weight": 1, "is_correct": False},
    {"id": "b", "option_text": "B", "weight": 5, "is_correct": True},
    {"id": "c", "option_text": "C", "weight": 3, "is_correct": False},
    {"id": "d", "option_text": "D", "weight": 9, "is_correct": False},
]


def _question(weighted=True):
    return Question(id="q", type="mcq", score_default=5,
                    metadata={"option_scoring": "weighted"} if weighted else {},
                    bank_question_options=OPTIONS)


def test_weighted_mcq_scores_selected_option_weight():
    assert calculate_single_answer_score(_question(), "c").score == 3
    assert calculate_single_answer_score(_question(), "a").score == 1
    # Bobot di atas skor soal dibatasi ke skor soal.
    assert calculate_single_answer_score(_question(), "d").score == 5
    assert calculate_single_answer_score(_question(), None).is_correct is None


def test_plain_mcq_is_unchanged():
    assert calculate_single_answer_score(_question(False), "c").score == 0
    assert calculate_single_answer_score(_question(False), "b").score == 5


def test_weighted_mcq_counts_toward_raw_total():
    result = grade_attempt(GradeBatchRequest(items=[GradeBatchItem(question=_question(), raw_answer="c")]))
    assert result.total_score == 3
    assert result.max_possible_score == 5


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
