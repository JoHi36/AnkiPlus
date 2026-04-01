"""Tests for _parse_quick_answer_response in ai/gemini.py."""
import pytest


def test_parse_cluster_summaries():
    """Test that the new ANTWORT/CLUSTER format parses correctly."""
    from ai.gemini import _parse_quick_answer_response

    response = (
        "ANTWORT: Cortisol ist ein Glucocorticoid der NNR.\n"
        "CLUSTER: cluster_0=Biosynthese|Cortisol wird aus Cholesterol synthetisiert. "
        "Die Synthese erfolgt in der Zona fasciculata.\n"
        "cluster_1=Wirkungen|Cortisol wirkt katabol und immunsuppressiv. "
        "Es beeinflusst den Glukosestoffwechsel."
    )

    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["answer"] == "Cortisol ist ein Glucocorticoid der NNR."
    assert result["answerable"] is True
    assert result["clusterLabels"]["cluster_0"] == "Biosynthese"
    assert result["clusterSummaries"]["cluster_0"].startswith("Cortisol wird")
    assert result["clusterLabels"]["cluster_1"] == "Wirkungen"
    assert "clusterSummaries" in result


def test_parse_fallback_no_cluster_marker():
    """If CLUSTER: marker is missing, return answer only."""
    from ai.gemini import _parse_quick_answer_response

    response = "Cortisol ist ein Stresshormon der NNR."
    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["answer"] == "Cortisol ist ein Stresshormon der NNR."
    assert result["clusterLabels"] == {}
    assert result["clusterSummaries"] == {}


def test_parse_fallback_no_answer_marker():
    """If ANTWORT: marker is missing, treat entire response as answer."""
    from ai.gemini import _parse_quick_answer_response

    response = "Cortisol ist ein Glucocorticoid."
    result = _parse_quick_answer_response(response, has_clusters=False)

    assert result["answer"] == "Cortisol ist ein Glucocorticoid."


def test_parse_pipe_in_cluster_name():
    """Only split on FIRST pipe — name may contain special chars."""
    from ai.gemini import _parse_quick_answer_response

    response = (
        "ANTWORT: Test.\n"
        "CLUSTER: cluster_0=Typ I / II|Beide Typen kommen vor."
    )
    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["clusterLabels"]["cluster_0"] == "Typ I / II"
    assert result["clusterSummaries"]["cluster_0"] == "Beide Typen kommen vor."
