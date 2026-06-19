import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hotmethod_analyzer import run_pprof_cpu, run_pprof_heap


def test_run_pprof_cpu_outputs_wrapped_samples():
    with tempfile.TemporaryDirectory() as work_dir:
        data_path = os.path.join(work_dir, "pprof.txt")
        with open(data_path, "w") as f:
            f.write("flat  flat%   sum%        cum   cum%\n")
            f.write("0.20s 20.00% 20.00%     0.30s 30.00%  main.work\n")

        products = run_pprof_cpu(data_path, work_dir, "tid-pprof")
        out_path = next(path for path, name in products.items() if name == "pprof_cpu.json")
        with open(out_path) as f:
            data = json.load(f)

        assert data["profile_type"] == "cpu"
        assert isinstance(data["samples"], dict)
        assert "main.work" in data["samples"]


def test_run_pprof_heap_outputs_wrapped_samples():
    with tempfile.TemporaryDirectory() as work_dir:
        data_path = os.path.join(work_dir, "heap.txt")
        with open(data_path, "w") as f:
            f.write("flat  flat%   sum%        cum   cum%\n")
            f.write("1MB 50.00% 50.00%     2MB 100.00%  main.alloc\n")

        products = run_pprof_heap(data_path, work_dir, "tid-heap")
        out_path = next(path for path, name in products.items() if name == "pprof_heap.json")
        with open(out_path) as f:
            data = json.load(f)

        assert data["profile_type"] == "heap"
        assert isinstance(data["samples"], list)
