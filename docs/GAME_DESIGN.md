# Game Design

The player is Lindenhafen's mayor from January 2026 through December 2036. They inspect the city, build a coalition, choose three manifesto priorities, allocate budgets, adopt policies, advance time, and respond to reports/events.

The current 24-month vertical slice includes housing, transit, and municipal-business-tax policies. Every choice has an implementation cost, monthly cost, delay, ramp, uncertainty range, and causal explanation. City health always uses `100 = good`; raw values remain visible.

The final campaign score is 60% geometric mean of all health scores and 40% mean of the three chosen priorities. Elections follow 2030 and 2035. Failure to form a coalition ends the campaign with an early report.
