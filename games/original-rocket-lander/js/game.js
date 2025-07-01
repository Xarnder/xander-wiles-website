async function promptAsync(question) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(prompt(question));
        }, 0);
    });
}

async function main() {
    var name = await promptAsync("What is your name?");
    var height = 100;
    var speed = 0;
    var coal = 60;
    var burn = 0;
    var gravity = 5;
    var maxSpeedForSafeLanding = 8;
    var instructionMessage = "The maximum speed for a safe landing is " + maxSpeedForSafeLanding + "m/s.";
	var statMessage = "Good luck Captain " + name + "!";
    

    var canvas = document.getElementById('gameview');
    var ctx = canvas.getContext('2d');
    var statsElement = document.getElementById('stats');
    var statsHTML = "" 
    var rocketInfo = ""

    function updateStats() {
        statsHTML = "<br />" 
        statsHTML += "<br />";
        statsHTML += instructionMessage;
        statsHTML += "<br />";
        statsHTML += statMessage;
        rocketInfo += "<br />"
        rocketInfo += "Burn: " + burn + "kg - Height: " + height + "m - Speed: " + speed + "m/s - Coal: " + coal + "kg"; 
        statsHTML += rocketInfo;
        // statsHTML += "<br />";
        // statsHTML += "Burn: " + burn + "kg";
        // statsHTML += " - Height: " + height + "m";
        // statsHTML += " - Speed: " + speed + "m/s";
        // statsHTML += " - Coal: " + coal + "kg";
        statsElement.innerHTML = statsHTML;
    }

    while (height > 0) {
        // Clear the canvas and draw elements
        // ...
		//Draw sky
		ctx.fillStyle = "rgb(0,0,50)";
		ctx.fillRect(0, 0, 300, 300);

		//Draw ground
		ctx.fillStyle = "rgb(127, 127, 126)";
		ctx.fillRect(0, 295, 300, 5);

		//Draw rocket
		var drawHeight = 250 - height * 2;
		ctx.fillStyle = "rgb(255, 0, 0)";
		ctx.fillRect(140, drawHeight, 20, 50);

		//Draw coal bar
		ctx.fillStyle = "rgb(0, 0, 255)";
		ctx.fillRect(15, 15, coal * 4, 10);
		ctx.strokeStyle = "rgb(255, 255, 255)";
		ctx.strokeRect(14, 14, 60 * 4, 10);

        // Update stats
        updateStats();

        // Ask for amount of coal to burn
        burn = await promptAsync("How much coal do you want to burn");
        burn = Number(burn);

        if (burn > coal)
            burn = coal;

        if (-burn > coal)
            burn = -coal;

        if (burn >= 0)
            coal -= burn;
        else
            coal += burn;

        speed = speed + gravity - burn;
        height -= speed;
    }

    // Clear the canvas and draw elements
    // ...
	//Draw sky
	ctx.fillStyle = "rgb(0,0,50)";
	ctx.fillRect(0, 0, 300, 300);

	//Draw ground
	ctx.fillStyle = "rgb(127, 127, 126)";
	ctx.fillRect(0, 295, 300, 5);

    if (speed <= maxSpeedForSafeLanding) {
        // Draw rocket and display success message
        // ...
		ctx.fillStyle = "rgb(0, 0, 255)";
		ctx.fillRect(15, 15, coal * 4, 10);
		ctx.strokeStyle = "rgb(255, 255, 255)";
		ctx.strokeRect(14, 14, 60 * 4, 10);
        instructionMessage = "The maximum speed for a safe landing was " + maxSpeedForSafeLanding + "m/s.";
		statMessage = "Congratulations Captain " + name + ". You landed safely with a speed of " + speed + "m/s and still had " + coal + "kg of coal left";
		ctx.fillStyle = "rgb(255, 0, 0)";
		ctx.fillRect(140, 245, 20, 50);
		// document.write("<p>Congratulations Captain " + name + ". You landed safely with a speed of " + speed + "m/s and still had " + coal + "kg of coal left");

    } else {
        // Draw explosion and display failure message
        // ...
		ctx.fillStyle = "rgb(0, 0, 255)";
		ctx.fillRect(15, 15, coal * 4, 10);
		ctx.strokeStyle = "rgb(255, 255, 255)";
		ctx.strokeRect(14, 14, 60 * 4, 10);
        instructionMessage = "The maximum speed for a safe landing was " + maxSpeedForSafeLanding + "m/s.";
		statMessage = "Rest In Peace Captain " + name + ". You crashed with a speed of " + speed + "m/s and still had " + coal + "kg of coal left";
		ctx.fillStyle = "rgb(255,102,0)";
		ctx.beginPath();
		ctx.arc(150, 295, 25 + coal * 2 + speed * 2, 180 * Math.PI / 180, 360 * Math.PI / 180);
		ctx.fill();
		// document.write("<p>Rest In Peace Captain " + name + ". You crashed with a speed of " + speed + "m/s and still had " + coal + "kg of coal left");

    }

    updateStats();
}

main();
