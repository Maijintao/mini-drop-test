"""统计分析层单测"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stats import compute_flame_stats, _gini_coefficient


class TestGiniCoefficient:
    def test_uniform_distribution(self):
        """完全均匀分布 → Gini ≈ 0"""
        values = [100, 100, 100, 100, 100]
        gini = _gini_coefficient(values)
        assert abs(gini) < 0.01, f"expected ~0, got {gini}"

    def test_max_concentration(self):
        """完全集中 → Gini 接近 1"""
        values = [0, 0, 0, 0, 1000]
        gini = _gini_coefficient(values)
        assert gini > 0.7, f"expected >0.7, got {gini}"

    def test_empty(self):
        assert _gini_coefficient([]) == 0.0
        assert _gini_coefficient([0, 0, 0]) == 0.0

    def test_single_value(self):
        """单个值 → Gini = 0"""
        assert _gini_coefficient([100]) == 0.0


class TestComputeFlameStats:
    def setup_method(self):
        self.stacks = {
            "main;foo;bar": 500,
            "main;foo;baz": 300,
            "main;qux": 150,
            "main;other": 50,
        }
        from analyzers.topn import analyze_topn
        self.topn = analyze_topn(self.stacks)

    def test_total_samples(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        assert stats["total_samples"] == 1000

    def test_total_functions(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        # main, foo, bar, baz, qux, other = 6
        assert stats["total_functions"] == 6

    def test_concentration_top1(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        # bar has 500 self samples out of 1000 = 50%
        assert stats["concentration"]["top_1_pct"] == 50.0

    def test_concentration_top3(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        # bar(500) + baz(300) + qux(150) = 950/1000 = 95%
        assert stats["concentration"]["top_3_pct"] == 95.0

    def test_performance_tiers(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        tiers = stats["performance_tiers"]
        # bar: 50% → critical
        # baz: 30% → critical
        # qux: 15% → critical
        assert len(tiers["critical"]) >= 2
        assert any(e["func"] == "bar" for e in tiers["critical"])

    def test_hot_paths(self):
        stats = compute_flame_stats(self.stacks, self.topn)
        hot_paths = stats["hot_paths"]
        assert len(hot_paths) > 0
        # 最热路径应该是 main;foo;bar (500 samples = 50%)
        assert hot_paths[0]["pct"] == 50.0
        assert "bar" in hot_paths[0]["stack"]

    def test_hot_paths_k(self):
        stats = compute_flame_stats(self.stacks, self.topn, hot_path_k=2)
        assert len(stats["hot_paths"]) <= 2

    def test_empty_stacks(self):
        from analyzers.topn import analyze_topn
        topn = analyze_topn({})
        stats = compute_flame_stats({}, topn)
        assert stats["total_samples"] == 0
        assert stats["concentration"]["gini_coefficient"] == 0

    def test_gini_not_zero(self):
        """非均匀分布 → Gini > 0"""
        stats = compute_flame_stats(self.stacks, self.topn)
        assert stats["concentration"]["gini_coefficient"] > 0
