import re
from server import PromptServer


def resolve_prompt_variables(json_data):
    prompt = json_data.get("prompt", {})
    if not isinstance(prompt, dict):
        return json_data

    # Build registry from Variable nodes. Last-write-wins by graph iteration order.
    registry = {}
    for _node_id, node in prompt.items():
        if node.get("class_type") == "Variable":
            inp = node.get("inputs", {})
            name = inp.get("name", "")
            value = inp.get("value", "")
            if isinstance(name, str) and name:
                registry[name] = "" if value is None else str(value)

    if not registry:
        return json_data

    # Single-pass substitution: build one regex over all known tokens, replace in one sweep.
    # Inserted text is NOT re-scanned -> no nesting/recursion (rule 3).
    lookup = {f"[{n}]": v for n, v in registry.items()}
    pattern = re.compile("|".join(re.escape(tok) for tok in lookup))

    for _node_id, node in prompt.items():
        if node.get("class_type") == "Variable":
            continue  # don't substitute into the declarations themselves
        inp = node.get("inputs", {})
        for key, val in inp.items():
            if isinstance(val, str) and "[" in val:
                inp[key] = pattern.sub(lambda m: lookup[m.group(0)], val)

    return json_data


# Register the pre-prompt handler. Guarded so the module can be imported standalone for tests.
if getattr(PromptServer, "instance", None) is not None:
    PromptServer.instance.add_on_prompt_handler(resolve_prompt_variables)


class Variable:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "name": ("STRING", {"default": "variable name"}),
                "value": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("value",)
    FUNCTION = "passthrough"
    CATEGORY = "utils"

    def passthrough(self, name, value):
        # Declarative node; the substitution is done by the on-prompt handler.
        # Output is provided so the value can also be wired normally if desired.
        return (value,)


NODE_CLASS_MAPPINGS = {"Variable": Variable}
NODE_DISPLAY_NAME_MAPPINGS = {"Variable": "Variable"}
