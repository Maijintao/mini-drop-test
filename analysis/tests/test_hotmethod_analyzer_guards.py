import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hotmethod_analyzer import (
    _is_analysis_product_key,
    _is_stale_running_analysis,
    _should_skip_running_analysis,
)


def test_analysis_product_filter_covers_generated_outputs():
    generated = [
        "tid/flamegraph.svg",
        "tid/top.json",
        "tid/suggestions.md",
        "tid/ai_suggestion.md",
        "tid/attribution_report.md",
        "tid/memleak.json",
        "tid/bw_sync_stats.json",
        "tid/namespace.json",
        "tid/assembly_stats.json",
        "tid/custom_stats.json",
    ]
    for key in generated:
        assert _is_analysis_product_key(key), key


def test_analysis_product_filter_keeps_raw_inputs():
    raw_inputs = [
        "profiler/tid/tid.collapsed",
        "profiler/tid/tid.txt",
        "profiler/tid/tid.pb.gz",
        "profiler/tid/tid.hprof",
        "profiler/tid/biosnoop.csv",
    ]
    for key in raw_inputs:
        assert not _is_analysis_product_key(key), key


def test_stale_running_analysis_uses_updated_at():
    old = datetime.now(timezone.utc) - timedelta(minutes=45)
    recent = datetime.now(timezone.utc) - timedelta(minutes=5)
    assert _is_stale_running_analysis({"updated_at": old.isoformat()})
    assert not _is_stale_running_analysis({"updated_at": recent.isoformat()})
    assert not _is_stale_running_analysis({})


def test_apiserver_pre_marked_running_analysis_can_continue(monkeypatch):
    recent = datetime.now(timezone.utc).isoformat()
    task = {"analysis_status": 1, "updated_at": recent}

    monkeypatch.delenv("DROP_ANALYSIS_TRIGGERED_BY_APISERVER", raising=False)
    assert _should_skip_running_analysis(task)

    monkeypatch.setenv("DROP_ANALYSIS_TRIGGERED_BY_APISERVER", "1")
    assert not _should_skip_running_analysis(task)
