Toilet Trouble — CSV Data Update

The game now loads restroom locations from Public_Restrooms_20261015.csv.

Included files:
- index.html
- script.js
- style.css
- toilet-trouble-music.mp3
- Public_Restrooms_20261015.csv

The game filters to listings whose Status is "Operational" and Accessibility is
"Fully Accessible", then keeps only facilities within the 1,500-meter Union
Square search zone. The qualifying facilities are shown for the 5-second preview
and revealed again after the game ends.

Because the game loads the CSV with fetch(), run it through a local web server
or host it (for example, GitHub Pages); opening index.html directly as file://
may block the CSV request.
