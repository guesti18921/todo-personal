# Offline deadline suggestions

This stage adds suggested calendar deadlines, not notifications or general AI
understanding. Both tasks and notes can accept suggestions. The entry text is
preserved; Apply changes only date/time. Dismiss and manual deadline choices
remember the proposed date/time in the saved record or new-entry draft.
Rephrasing the same deadline does not repeat the dismissed prompt; a different
deadline can be proposed. Existing deadlines are replaced only by confirmation.

Settings → Deadline suggestions enables/disables suggestions for the account
on the current device/browser. This preference does not sync to other devices.
The parser runs offline and never sends entry text to a parsing service.

Examples (assuming local date 6 October 2026):

| Text | Suggested deadline |
| --- | --- |
| Завтра в 18:00 позвонить | 7 October, 18:00 |
| Tomorrow at 6 pm call | 7 October, 18:00 |
| Morgen um 18 Uhr einkaufen | 7 October, 18:00 |
| Domani alle 18 chiamare | 7 October, 18:00 |
| Mañana a las 18 llamar | 7 October, 18:00 |
| 明天下午6点打电话 | 7 October, 18:00 |
| 明日午後6時電話する | 7 October, 18:00 |
| Demain à 18 appeler | 7 October, 18:00 |
| Amanhã às 18 ligar | 7 October, 18:00 |
| 내일 오후6시 전화 | 7 October, 18:00 |

Supported scope: basic today/tomorrow/yesterday phrases, selected day-after-
tomorrow phrases, explicit YYYY-MM-DD and day-first DD.MM.YYYY/DD/MM/YYYY,
two-digit DD.MM without year, Chinese/Japanese numeric calendar notation,
HH:mm, am/pm and common explicit hour expressions. A date without a year uses
its next occurrence. Time without a date proposes its next occurrence today
or tomorrow and labels this assumption. Device local time is used, independent
of the connection IP. No translation, weekdays, recurrence, or arbitrary
natural-language understanding is claimed. Competing or invalid deadlines
produce no suggestion; a clear past deadline is proposed with a past warning.

The no-deadline Today pin is shown only when date is empty. Choosing a date
clears the pin and explains automatic Today placement. Undated pins stay in
Today until manually removed. Cards distinguish Tomorrow, overdue dates and
undated Today pins. Android notifications remain a separate later stage.

## Weekdays and numeric durations

Weekdays and numeric minute/hour/day/week expressions are supported in the ten existing languages. Examples: “в пятницу в 18:00”, “Friday at 6 pm”, “in 2 Stunden”, “tra 2 ore”, “en 3 días”, “vendredi prochain”, “2小时后”, “来週の金曜日”, “2시간 후”. The editor includes a collapsed example list.

A bare weekday means its next suitable occurrence, including today if the specified time has not passed. “Next Friday” means Friday of the next Monday-based calendar week; “this Monday” may be past. The actual interpretation and resulting date are shown before acceptance. An explicit calendar date is never shifted because its time has passed.

Hour/minute durations use elapsed time, rounded up to a minute so a reminder is not early. Day/week durations use local calendar arithmetic and do not invent a time. Non-positive, fractional, excessive and competing durations are rejected. Compound phrases such as “in 1 hour and 30 minutes” are not partially interpreted; they need a manual deadline. Word numbers and many less common grammatical variants remain unsupported.

The editor saves an anchor containing the text and input time in drafts and records. Unchanged text keeps its anchor across reopen; changing the text resets it. Deadline helpers compare the resulting time against the current clock for past warnings. Existing records without anchors use their first editor open as the anchor. This is rule-based local recognition, not automatic translation or general language understanding.

“Apply deadline and remind” is an explicit separate action. It sets at-deadline reminder mode, shows 09:00 when the phrase contains only a date, and enables the device switch if off (requesting Android notification permission where applicable). Past reminder times disable this action; the user can still accept a past deadline separately. Refusing device permission retains the chosen fields and explains why delivery is disabled. The original text remains intact.
