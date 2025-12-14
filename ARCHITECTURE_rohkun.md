================================================================================
🚀 ROHKUN CODE AUDIT - Project: DocExtract
================================================================================
https://rohkun.com  |  © 2025 Rohkun Labs
--------------------------------------------------------------------------------
📅 Report Generated: 2025-12-14  |  Analyzer Version: 2.0.0
User: local@user
Report ID: RHKN-6F2C57
================================================================================
OVERVIEW
================================================================================
Files Processed: 138
Languages Detected: Python, TypeScript
Total Lines Analyzed: 27,600
Deterministic Accuracy: Nearly all detections are deterministic
Average Analysis Time: 2.6 sec
Token Savings: 2,500 tokens ($0.07 equivalent)

================================================================================
KEY INSIGHTS
================================================================================
✅ Excellent frontend-backend integration detected
⚠️  10 high-impact nodes detected - changes would affect many files
================================================================================
SUMMARY METRICS
================================================================================
Backend Endpoints Detected: 8 confident + 0 uncertain
Frontend API Calls Found: 7 confident + 0 uncertain
Total Patterns: 15 (15 deterministic)
Detection Methods: Primarily AST parsing with some pattern matching
================================================================================
BACKEND ENDPOINTS
================================================================================
✓ CONFIDENT FINDINGS
These endpoints were parsed deterministically from your code:

GET    /health                                  [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\main.py:28]
GET    /document/{whisper_hash}                 [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\document.py:8]
GET    /highlight                               [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\highlight.py:40]
GET    /retrieve                                [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\retrieve.py:8]
GET    /status                                  [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\status.py:8]
POST   /structure/{whisper_hash}                [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\structure.py:9]
POST   /upload                                  [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\upload.py:10]
POST   /webhook/llmwhisperer                    [D:\projects_all_time\02 DocExtract\00 code\DocExtract\backend\routes\webhook.py:6]

================================================================================
FRONTEND API CALLS
================================================================================
✓ CONFIDENT FINDINGS
These API calls were parsed deterministically from your code:

POST   ${API_BASE}/upload                       [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\lib\api.ts:37] (via fetch)
GET    ${API_BASE}/status?whisper_hash=${hash}  [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\lib\api.ts:57] (via fetch)
GET    ${API_BASE}/retrieve?whisper_hash=${hash} [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\lib\api.ts:72] (via fetch)
GET    ${API_BASE}/highlight?whisper_hash=${hash}&line=${line}&target_width=${width}&target_height=${height} [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\lib\api.ts:92] (via fetch)
POST   ${API_BASE}/structure/${hash}            [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\lib\api.ts:165] (via fetch)
GET    ${API_BASE}${path}                       [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\utils\api.ts:10] (via fetch)
POST   ${API_BASE}${path}                       [D:\projects_all_time\02 DocExtract\00 code\DocExtract\src\utils\api.ts:29] (via fetch)

================================================================================
CONNECTION VERIFICATION
================================================================================
✅ Found 10 connections between frontend and backend
   Connection Quality: Excellent (most endpoints have connections)

Note: Connection matching uses pattern matching and may have false positives.
Always verify connections manually, especially for:
  • GraphQL endpoints (may be used through Apollo Client)
  • WebSocket endpoints (may be used through Socket.io)
  • Dynamic routes with runtime parameters


================================================================================
DEPENDENCIES
================================================================================
Imports Detected: 367
Function Calls Detected: 1526
Function Definitions Detected: 76

Sample Imports:
  • unknown [from eslint.config.js:1]
  • unknown [from eslint.config.js:2]
  • unknown [from eslint.config.js:3]
  • unknown [from eslint.config.js:4]
  • unknown [from eslint.config.js:5]
  ... and 362 more imports

================================================================================
LANGUAGE COVERAGE
================================================================================
Python: 8 files | Endpoints: 8 | API Calls: 0 | Confidence: High
TypeScript: 0 files | Endpoints: 0 | API Calls: 0 | Confidence: High
================================================================================
BLAST RADIUS ANALYSIS
================================================================================
High Impact Nodes: 10

These nodes have many dependents - changes would affect many files:

• func:cn (CRITICAL)
  Changing function 'func:cn' has no detected dependents.
• func:console.error (CRITICAL)
  Changing function 'func:console.error' has no detected dependents.
• func:useEffect (CRITICAL)
  Changing function 'func:useEffect' has no detected dependents.
• func:cva (CRITICAL)
  Changing function 'func:cva' has no detected dependents.
• func:APIRouter (HIGH)
  Changing function 'func:APIRouter' has no detected dependents.
... and 5 more

================================================================================
CONFIDENCE DISTRIBUTION
================================================================================
Distribution: No confidence data

Confidence Levels:
• CERTAIN: AST-based detection with literal paths (most reliable)
• HIGH: Framework pattern matching (very reliable)
• MEDIUM: Heuristic-based detection (requires verification)
• LOW: Pattern-based guesses (manual review recommended)

================================================================================
TOKEN SAVINGS SUMMARY
================================================================================
Without Rohkun: ~2,500 tokens ($0.07)
With Rohkun: ~80 tokens ($0.00)
Saved: 2,420 tokens (~$0.07 saved per report)

================================================================================
DISCLAIMER
================================================================================
This report is generated using static deterministic analysis. Dynamic values
such as environment variables, runtime imports, or reflection may affect final
behavior. For validation, run the application with live configuration and
compare logs with static output. Accuracy estimates are based on parser
confidence levels at analysis time.

================================================================================
VISUALIZATION
================================================================================
🎨 View interactive 3D network graph:
   Run 'rohkun run' and check the visualization link in the output
   Or visit: http://localhost:8000 (if server is running)

================================================================================

================================================================================
CONTINUITY TRACKING
================================================================================
Project: RHKN-6F2C57
Snapshot: #4
Drift Score: 0.00 (healthy)
Previous Scan: snapshot_20251214_044657

Drift Levels:
  • 0.0-0.2: Low drift (healthy, focused changes)
  • 0.2-0.5: Medium drift (review changes)
  • 0.5+: High drift (significant refactor)

END OF REPORT
================================================================================