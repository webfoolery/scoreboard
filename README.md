# Scoreboard

- Add any number of teams
- Customise team names & sort order
- You can either enter numbers for a score (eg. '96') or expressions/sums (eg. 47*19)
- Scores entered as expressions are totalled using BODMAS
- Each individual score shows the expression if one was used
- Each time you add a score to the list the team selector moves on to the next team ready to receive their score
- 'Undo' lets you reverse the scoring history
- You can tap on a past score to override/correct it 
- All data for the current scores is stored, so if you refresh the page or leave it a while it'll remember what's what
- 'Reset' clears the current scoring session & starts a fresh one
- When adding numbers you can swap phone keyboard to one with digits & +/*- and just keep adding scores & pressing 'Enter'


# Changelog

### 2026-04-22
* Updates JS to fix start teams being A/B and additional teams being 3/4/5 etc. Now all teams are numeric, ie. Team 1, Team 2 etc.
* Removes the fixed height wrapper around the score table as that was unpleasant UI faff.
* Larger text for the total row on team names & total scores
* Changes to gradient background. It looked nice but had harsh vertical repeats. Now it's applied to specific containers