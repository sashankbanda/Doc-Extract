from backend.services.llm_service import find_canonical_name, CANONICAL_MAPPINGS

print("Checking 'Section' mapping...")
canonical = find_canonical_name("Section")
print(f"'Section' maps to: {canonical}")

print("\nChecking 'Coverage' mapping...")
canonical = find_canonical_name("Coverage")
print(f"'Coverage' maps to: {canonical}")

print("\nChecking why 'Section' mapped (if it did):")
if canonical:
    print(f"Synonyms for {canonical}:")
    for syn in CANONICAL_MAPPINGS.get(canonical, []):
        if "section" in syn.lower():
            print(f"- Matches synonym: '{syn}'")
