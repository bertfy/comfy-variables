from comfy_extras.nodes_variables import resolve_prompt_variables


def test_basic_substitution():
    data = {"prompt": {
        "1": {"class_type": "Variable",
              "inputs": {"name": "color name", "value": "muted plum"}},
        "2": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "a lone figure in a [color name] coat", "clip": ["4", 1]}},
    }}
    out = resolve_prompt_variables(data)
    assert out["prompt"]["2"]["inputs"]["text"] == "a lone figure in a muted plum coat"


def test_missing_token_left_literal():
    data = {"prompt": {
        "1": {"class_type": "Variable",
              "inputs": {"name": "color name", "value": "muted plum"}},
        "2": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "[color name] coat, [mood] tone", "clip": ["4", 1]}},
    }}
    out = resolve_prompt_variables(data)
    assert out["prompt"]["2"]["inputs"]["text"] == "muted plum coat, [mood] tone"


def test_last_write_wins():
    data = {"prompt": {
        "1": {"class_type": "Variable", "inputs": {"name": "style", "value": "16mm"}},
        "2": {"class_type": "Variable", "inputs": {"name": "style", "value": "35mm"}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "shot on [style]", "clip": ["4", 1]}},
    }}
    out = resolve_prompt_variables(data)
    assert out["prompt"]["3"]["inputs"]["text"] == "shot on 35mm"


def test_no_nesting():
    # value contains a token; must NOT be re-resolved
    data = {"prompt": {
        "1": {"class_type": "Variable", "inputs": {"name": "era", "value": "1980s"}},
        "2": {"class_type": "Variable", "inputs": {"name": "style", "value": "[era] film stock"}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "[style]", "clip": ["4", 1]}},
    }}
    out = resolve_prompt_variables(data)
    # single pass over the consumer string: [style] -> "[era] film stock", and that
    # inserted [era] is left literal (not re-scanned).
    assert out["prompt"]["3"]["inputs"]["text"] == "[era] film stock"
