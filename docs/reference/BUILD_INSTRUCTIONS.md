
# Frontend Build Instructions

## Building the Frontend

Before testing changes in Anki, always build the React frontend.

### Prerequisites

⚠️ **Close Anki completely** before building. The addon loads files from the `web/` directory, and file locks can cause build failures.

### Steps

1. Navigate to the frontend directory:
   ```bash
   cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
   ```

2. Build the frontend:
   ```bash
   npm run build
   ```

   This creates optimized files in the `web/` directory.

3. Restart Anki and verify the changes load.

## Build Troubleshooting

**Build fails or file locks occur:**
- Ensure Anki is completely closed (check Activity Monitor for stray processes)
- Clear the build cache and try again:
  ```bash
  rm -rf web/
  npm run build
  ```

**Changes don't appear after restart:**
- Hard refresh: Quit Anki, delete `web/` directory, rebuild, restart Anki
- Check browser console (F12) for JavaScript errors


