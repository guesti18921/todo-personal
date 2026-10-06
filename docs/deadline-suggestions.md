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
