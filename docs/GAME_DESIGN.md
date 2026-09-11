# Game Design

The player leads one fictional Lindenhafen council party from January 2026 through December 2036. Their faction has agenda-setting power but not absolute control: the other parties retain seats and influence. The player inspects the city, builds a coalition, chooses three manifesto priorities, allocates budgets, adopts policies, advances time, and responds to reports/events.

The current 24-month vertical slice includes housing, transit, and municipal-business-tax policies. Every choice has an implementation cost, monthly cost, delay, ramp, uncertainty range, and causal explanation. City health always uses `100 = good`; raw values remain visible.

The final campaign score is 60% geometric mean of all health scores and 40% mean of the three chosen priorities. Elections follow 2030 and 2035. Failure to form a coalition ends the campaign with an early report.

## Event loop

Alongside policies the city produces events: incidents that simply happen, external decisions from state and federal level, council motions the player must answer, escalations of problems left untreated, and scheduled milestones such as the January budget and the 2030/2035 elections. Roughly 0.8 events occur per month, about 40 % of them requiring a council vote, for four to six votes per year.

The player picks an option, sees an exact majority forecast, may negotiate, amend, or campaign, and then the council votes. Passing is not guaranteed; failing is a legitimate and consequential outcome. Effects arrive with authored delay and ramp, so most answers are only legible one to four years later. The library and the voting mechanics are specified in [`EVENT_MATRIX.md`](EVENT_MATRIX.md), the indicators they move in [`METRICS.md`](METRICS.md).
