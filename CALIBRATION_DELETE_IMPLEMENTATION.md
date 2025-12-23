# Calibration Delete Implementation Details

## File Structure

```
src/components/Calibrator.tsx
├── Helper Functions (Lines 35-62)
│   ├── getSavedCalibrations()        - Load history from localStorage
│   ├── saveCalibrationToHistory()    - Save new calibration (existing)
│   └── deleteCalibrationFromHistory() - DELETE a calibration (NEW)
│
├── Component State (Lines 334-338)
│   ├── [calibrationPoints, setCalibrationPoints]
│   ├── [savedCalibrations, setSavedCalibrations]
│   ├── [showHistory, setShowHistory]
│   └── ... other state
│
└── JSX History Section (Lines 995-1026)
    └── Calibration History Dropdown
        ├── Header Button (toggle show/hide)
        └── History List (when showHistory === true)
            └── For each calibration item:
                ├── Left: Clickable info (load calibration)
                └── Right: Delete button (NEW)
```

## New Function: deleteCalibrationFromHistory()

```tsx
function deleteCalibrationFromHistory(id: string) {
  try {
    const history = getSavedCalibrations();
    const filtered = history.filter((cal) => cal.id !== id);
    localStorage.setItem("ndn-calibration-history", JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to delete calibration from history:", err);
  }
}
```

**Parameters:**
- `id: string` - The unique ID of the calibration to delete (created from `Date.now().toString()`)

**Flow:**
1. Get all calibrations from localStorage
2. Filter array to exclude the one with matching ID
3. Save filtered array back to localStorage
4. Log any errors (doesn't throw - fails gracefully)

**Why this works:**
- `Array.filter()` creates a new array without the matching item
- `JSON.stringify()` serializes the filtered array
- `localStorage.setItem()` atomically replaces the entire history
- No partial updates = no corruption risk

## Updated JSX History Section

### Container Change
**Before:**
```tsx
<button
  key={cal.id}
  onClick={() => {...}}
  className="w-full text-left p-3 bg-slate-700/40 hover:bg-slate-700/60 rounded-lg transition-all border border-slate-600/30 hover:border-slate-500/30"
>
  <div className="flex items-center justify-between">
    <div>
      {/* info */}
    </div>
    <span className="text-sm">→</span>
  </div>
</button>
```

**After:**
```tsx
<div
  key={cal.id}
  className="... flex items-center justify-between group"
>
  <button
    onClick={() => {...}}
    className="flex-1 text-left"
  >
    {/* info */}
  </button>
  <button
    onClick={(e) => {
      e.stopPropagation();
      deleteCalibrationFromHistory(cal.id);
      setSavedCalibrations(getSavedCalibrations());
    }}
    className="ml-2 p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
    title="Delete this calibration"
  >
    <span className="text-lg font-bold">✕</span>
  </button>
</div>
```

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `group` | Enables child hover states |
| `group-hover:opacity-100` | Shows button on parent hover |
| `opacity-0` | Hides button by default |
| `hover:text-red-300` | Text color on button hover |
| `hover:bg-red-500/20` | Background on button hover |
| `flex-shrink-0` | Prevents button from shrinking |
| `ml-2` | Margin from info to button |
| `p-1.5` | Padding inside button |
| `transition-all` | Smooth opacity/color changes |

### Flex Layout

```
<div className="flex items-center justify-between">
  ↓
  ├─ flex-1 button (load)     ← stretches to fill
  │   └─ text-left
  │       └─ calibration info
  │
  └─ flex-shrink-0 button (delete)  ← doesn't shrink
      └─ opacity-0 → group-hover:opacity-100
```

## Event Handling

### Load Calibration (Left Button)
```tsx
onClick={() => {
  handleLoadPrevious(cal);
  setShowHistory(false);
}}
```
- Calls existing `handleLoadPrevious()` function
- Closes the dropdown after selection
- Updates entire calibration state

### Delete Calibration (Right Button)
```tsx
onClick={(e) => {
  e.stopPropagation();  // Prevent triggering left button
  deleteCalibrationFromHistory(cal.id);
  setSavedCalibrations(getSavedCalibrations());
}}
```

**Step-by-step:**
1. `e.stopPropagation()` prevents the click from bubbling to parent
2. Call `deleteCalibrationFromHistory()` to update localStorage
3. Call `getSavedCalibrations()` to read updated localStorage
4. Call `setSavedCalibrations()` to trigger React re-render
5. Component re-renders without the deleted item

## State Management Flow

```
Initial Load
    ↓
[savedCalibrations] = getSavedCalibrations()
    ↓
User hovers over item
    ↓
Delete button appears (CSS only, no state change)
    ↓
User clicks ✕
    ↓
deleteCalibrationFromHistory(id)
    ↓
localStorage updated
    ↓
setSavedCalibrations(getSavedCalibrations())
    ↓
React re-renders component
    ↓
Item no longer in savedCalibrations
    ↓
<div> with that cal.id not in output
    ↓
Deleted item disappears from UI
```

## Error Cases

### Case 1: localStorage is full/unavailable
- `localStorage.setItem()` throws error
- Error is caught and logged
- User sees history unchanged (old item still visible)
- User can refresh page to sync UI with actual localStorage state

### Case 2: Corruption in localStorage JSON
- `JSON.parse()` in `getSavedCalibrations()` throws error
- Function returns empty array `[]`
- History appears empty
- User can re-save calibrations to rebuild history

### Case 3: Race condition (multiple windows)
- Window A deletes calibration
- Window B hasn't refreshed yet
- Very unlikely with synchronous localStorage
- User can close and reopen history dropdown to refresh

## Testing Recommendations

1. **Basic Delete:**
   - Create several calibrations
   - Hover over one, click ✕
   - Verify it disappears

2. **localStorage Verification:**
   - Open DevTools → Application → localStorage
   - Search for `ndn-calibration-history`
   - Delete via UI and check localStorage size decreases

3. **Max Items Limit:**
   - Create 10+ calibrations (history keeps only 10)
   - Delete 5 items
   - Create 2 more
   - Should stay at or below 10 items

4. **Refresh After Delete:**
   - Delete an item
   - Refresh page
   - Item should still be gone
   - Verify via localStorage

5. **Load After Delete:**
   - Have 3 calibrations, delete the middle one
   - Load the first one
   - Load the third one (should still work)
   - Verify no stale data is loaded

## Performance Considerations

- **Synchronous**: All operations use synchronous localStorage API
- **No debounce needed**: One delete = one localStorage write
- **Memory**: Each deletion frees 1-2KB of localStorage
- **CPU**: Array.filter() is O(n) but n ≤ 10 items, negligible
- **DOM updates**: React efficiently re-renders only the changed item

## Browser Compatibility

| Feature | IE11 | Edge | Chrome | Firefox | Safari |
|---------|------|------|--------|---------|--------|
| localStorage | ✓ | ✓ | ✓ | ✓ | ✓ |
| Array.filter() | ✓ | ✓ | ✓ | ✓ | ✓ |
| CSS opacity | ✓ | ✓ | ✓ | ✓ | ✓ |
| CSS :hover | ✓ | ✓ | ✓ | ✓ | ✓ |
| CSS group-hover | ✗ | ✓ | ✓ | ✓ | ✓ |

**Note:** CSS `group-hover` requires Tailwind CSS (which is already in use)

## Security Considerations

- **No authentication needed**: Calibrations are stored client-side only
- **No API calls**: Deletion is purely client-side
- **No XSS risk**: IDs are numeric timestamps, not user input
- **No injection risk**: JSON.stringify handles special characters
- **localStorage scope**: Per-origin, can't be accessed from other sites
