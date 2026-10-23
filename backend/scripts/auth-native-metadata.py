#!/usr/bin/env python3
"""Keep only observed authentication reflection plus the supported COSE key variants."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "backend/src/main/resources/META-INF/native-image/se.forena/authentication/reachability-metadata.json"


def authentication_metadata(trace):
    reflection = []
    for entry in trace["reflection"]:
        name = entry.get("type")
        # Spring's JDBC grant JSON contains trusted collection implementation IDs.
        # Native images still need their names registered for Class.forName.
        collection = isinstance(name, str) and name.startswith("java.util.Collections$")
        empty_kotlin = name in ("kotlin.collections.EmptyMap", "kotlin.collections.EmptyList")
        if collection or empty_kotlin:
            reflection.append(entry)
        elif isinstance(name, str) and name.startswith(("org.springframework.security.", "com.webauthn4j.")):
            # Type-only entries preserve reflective discovery of Jackson mixins
            # and model annotations, even when no member is invoked directly.
            model = name.startswith(("org.springframework.security.web.webauthn.", "com.webauthn4j.",
                                     "org.springframework.security.oauth2.server.authorization.jackson."))
            if model or entry.get("methods") or entry.get("fields"):
                registered = dict(entry)
                if ".jackson." in name and "Mixin" in name:
                    # Jackson reads field annotations on mixins (not field values).
                    registered["allDeclaredFields"] = True
                reflection.append(registered)
    # Authenticator algorithm choice varies. Preserve EC2, RSA and EdDSA support;
    # a single virtual authenticator trace only observes its preferred algorithm.
    keys = ["com.webauthn4j.data.attestation.authenticator." + name
            for name in ("EC2COSEKey", "RSACOSEKey", "EdDSACOSEKey")]
    reflection = [entry for entry in reflection if entry["type"] not in keys]
    reflection.extend({"type": name, "allDeclaredConstructors": True, "allDeclaredMethods": True} for name in keys)
    return {"reflection": sorted(reflection, key=lambda entry: entry["type"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace", type=Path, help="GraalVM agent's reachability-metadata.json")
    args = parser.parse_args()
    metadata = authentication_metadata(json.loads(args.trace.read_text()))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Wrote {len(metadata['reflection'])} authentication reflection entries")
