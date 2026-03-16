"""
Debug script to check if dark mode detection works
Run this in Anki's Debug Console (Tools → Debug Console)
"""

from aqt import mw

# Check if dark mode is enabled
is_dark_mode = False
try:
    if mw and mw.pm:
        is_dark_mode = mw.pm.night_mode()
        print(f"✅ Dark mode detection works!")
        print(f"   Night mode active: {is_dark_mode}")
    else:
        print("❌ mw or mw.pm not available")
except Exception as e:
    print(f"❌ Error detecting dark mode: {e}")

# Check custom reviewer status
try:
    from custom_reviewer import custom_reviewer
    print(f"\n✅ Custom reviewer imported")
    print(f"   Active: {custom_reviewer.active}")
    print(f"   Hook registered: {custom_reviewer._hook_registered}")
except Exception as e:
    print(f"❌ Error importing custom reviewer: {e}")

print("\n" + "="*50)
print("COPY THIS OUTPUT AND SEND IT TO ME")
print("="*50)
