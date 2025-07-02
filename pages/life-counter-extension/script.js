document.addEventListener('DOMContentLoaded', function () {
	// Theme toggle functionality
	const themeToggleButton = document.getElementById('theme-toggle');
  
	function applyTheme(theme) {
	  if (theme === 'dark') {
		document.body.classList.add('dark-mode');
		themeToggleButton.textContent = "Switch to Light Mode";
	  } else {
		document.body.classList.remove('dark-mode');
		themeToggleButton.textContent = "Switch to Dark Mode";
	  }
	}
  
	// On load, check localStorage for theme preference (default is light)
	const storedTheme = localStorage.getItem('theme') || 'light';
	applyTheme(storedTheme);
  
	themeToggleButton.addEventListener('click', () => {
	  if (document.body.classList.contains('dark-mode')) {
		applyTheme('light');
		localStorage.setItem('theme', 'light');
	  } else {
		applyTheme('dark');
		localStorage.setItem('theme', 'dark');
	  }
	});
  	
	
	const lifeGrid = document.getElementById('life-grid');
	const ageLabels = document.getElementById('age-labels');
	const weekLabels = document.getElementById('week-labels');
	const menuButton = document.getElementById('menu-button');
	const menu = document.getElementById('menu');
	const saveButton = document.getElementById('save-button');
	const timeLeftEl = document.getElementById('time-left');
	const percentageCompletedEl = document.getElementById('percentage-completed');
	const weeksSinceBirthdayEl = document.getElementById('weeks-since-birthday');
	let dateOfBirth = null;
	let predictedLifespan = 0;
  
	const boxSize = 10; // 10px per box
	const gapSize = 3; // 3px gap between boxes
  
	// Function to calculate the number of weeks between two dates
	function calculateWeeksBetween(startDate, endDate) {
	  const millisecondsPerWeek = 1000 * 60 * 60 * 24 * 7;
	  const differenceInMilliseconds = endDate - startDate;
	  return Math.floor(differenceInMilliseconds / millisecondsPerWeek); // Round down
	}
  
	// Function to calculate the last birthday
	function calculateLastBirthday(today, dateOfBirth) {
	  const currentYear = today.getFullYear();
	  const lastBirthday = new Date(dateOfBirth);
	  lastBirthday.setFullYear(currentYear);
  
	  // If today's date is before the birthday this year, use the birthday from the previous year
	  if (today < lastBirthday) {
		lastBirthday.setFullYear(currentYear - 1);
	  }
  
	  return lastBirthday;
	}
  
	// Function to calculate age in years
	function calculateAgeInYears(today, dateOfBirth) {
	  let age = today.getFullYear() - dateOfBirth.getFullYear();
	  const birthdayThisYear = new Date(today.getFullYear(), dateOfBirth.getMonth(), dateOfBirth.getDate());
  
	  // If today is before their birthday this year, subtract 1 year
	  if (today < birthdayThisYear) {
		age--;
	  }
	  return age;
	}
  
	// Function to calculate the time left in years, months, weeks, and days
	function calculateTimeLeft(today, dateOfBirth, predictedLifespan) {
	  const deathDate = new Date(dateOfBirth);
	  deathDate.setFullYear(deathDate.getFullYear() + predictedLifespan);
  
	  const millisecondsPerDay = 1000 * 60 * 60 * 24;
	  const timeLeftMilliseconds = deathDate - today;
	  const timeLeftDays = Math.floor(timeLeftMilliseconds / millisecondsPerDay);
  
	  const yearsLeft = Math.floor(timeLeftDays / 365);
	  const monthsLeft = Math.floor((timeLeftDays % 365) / 30);
	  const weeksLeft = Math.floor(((timeLeftDays % 365) % 30) / 7);
	  const daysLeft = ((timeLeftDays % 365) % 30) % 7;
  
	  return { yearsLeft, monthsLeft, weeksLeft, daysLeft };
	}
  
	// Function to generate the age labels, week numbers, and life grid based on the lifespan
	function generateLifeGrid(predictedLifespan, today) {
	  // Clear the current grid and labels
	  lifeGrid.innerHTML = '';
	  ageLabels.innerHTML = '';
	  weekLabels.innerHTML = '';
	  lifeGrid.style.position = 'relative'; // Make the grid relative for absolute positioning
  
	  // Create age labels at the top of each column (for each year)
	  for (let year = 0; year < predictedLifespan; year++) {
		const ageLabel = document.createElement('div');
		ageLabel.classList.add('age-label');
		ageLabel.textContent = year;
		ageLabels.appendChild(ageLabel);
	  }
  
	  // Create week numbers on the left side
	  for (let week = 1; week <= 52; week++) {
		const weekLabel = document.createElement('div');
		weekLabel.classList.add('week-label');
		weekLabel.textContent = week;
		weekLabels.appendChild(weekLabel);
	  }
  
	  // Calculate age in years and weeks since the last birthday
	  const ageInYears = calculateAgeInYears(today, dateOfBirth);
	  const lastBirthday = calculateLastBirthday(today, dateOfBirth);
	  const weeksSinceLastBirthday = calculateWeeksBetween(lastBirthday, today);
  
	  // Total number of filled boxes = (age in years * 52) + weeks since last birthday
	  const totalWeeksLived = (ageInYears * 52) + weeksSinceLastBirthday;
  
	  // Calculate the width of the grid dynamically
	  const gridWidth = predictedLifespan * (boxSize + gapSize); // Grid width = number of columns * (box size + gap)
  
	  // Create boxes for each week of the predicted lifespan, filling left to right
		// Create boxes for each week of the predicted lifespan, filling left to right
		const totalBoxes = predictedLifespan * 52; // 52 weeks per year

		for (let row = 0; row < 52; row++) { // 52 rows for weeks
			for (let col = 0; col < predictedLifespan; col++) { // Columns for years
				const boxIndex = row + col * 52; // Calculate the index for filling left to right
				const box = document.createElement('div');
				box.classList.add('square');

				// Fill the box if the person has already lived that week
				if (boxIndex < totalWeeksLived) {
				box.style.backgroundColor = 'black';
				}

				lifeGrid.appendChild(box);
		}
	}

  
	  // Adjust the grid template columns to match the predicted lifespan
	  lifeGrid.style.gridTemplateColumns = `repeat(${predictedLifespan}, ${boxSize}px)`;
	  ageLabels.style.gridTemplateColumns = `repeat(${predictedLifespan}, ${boxSize}px)`;
  
	  // Calculate time left and percentage completed
	  const timeLeft = calculateTimeLeft(today, dateOfBirth, predictedLifespan);
	  const percentageCompleted = (totalWeeksLived / totalBoxes) * 100;
  
	  // Display stats
	  timeLeftEl.textContent = `Time left: ${timeLeft.yearsLeft} years, ${timeLeft.monthsLeft} months, ${timeLeft.weeksLeft} weeks, and ${timeLeft.daysLeft} days`;
	  percentageCompletedEl.textContent = `You are ${percentageCompleted.toFixed(2)}% through your life.`;
	  weeksSinceBirthdayEl.textContent = `Weeks since last birthday: ${weeksSinceLastBirthday}`;
  
	  // Insert the red line under the "weeks-since-birthday" row (stretching across all columns)
	  const redLine = document.createElement('div');
	  redLine.classList.add('red-line');
	  const topPosition = weeksSinceLastBirthday * 13; // 10px box height + 3px gap
	  redLine.style.top = `${topPosition}px`; // Position the line at the correct gap
	  redLine.style.width = `${gridWidth}px`; // Set the width dynamically based on the grid width
	  redLine.style.left = '0'; // Align the red line with the start of the grid
	  lifeGrid.appendChild(redLine);
	}
  
	// Function to save inputs to localStorage
	function saveToLocalStorage(dateOfBirth, predictedLifespan) {
	  localStorage.setItem('dateOfBirth', dateOfBirth.toISOString());
	  localStorage.setItem('predictedLifespan', predictedLifespan);
	}
  
	// Function to load inputs from localStorage
	function loadFromLocalStorage() {
	  const storedDOB = localStorage.getItem('dateOfBirth');
	  const storedLifespan = localStorage.getItem('predictedLifespan');
  
	  if (storedDOB && storedLifespan) {
		dateOfBirth = new Date(storedDOB);
		predictedLifespan = parseInt(storedLifespan);
  
		const today = new Date();
		generateLifeGrid(predictedLifespan, today);
	  }
	}
  
	// Toggle the visibility of the menu
	menuButton.addEventListener('click', () => {
	  if (menu.style.display === 'none' || menu.style.display === '') {
		menu.style.display = 'block';
	  } else {
		menu.style.display = 'none';
	  }
	});
  
	// Save the user's date of birth and lifespan when "Save" is clicked
	saveButton.addEventListener('click', () => {
	  const dobInput = document.getElementById('dob').value;
	  const lifespanInput = document.getElementById('lifespan').value;
  
	  if (dobInput && lifespanInput) {
		dateOfBirth = new Date(dobInput);
		predictedLifespan = parseInt(lifespanInput);
  
		if (isNaN(dateOfBirth.getTime())) {
		  alert('Invalid Date of Birth. Please enter a valid date.');
		  return;
		}
  
		const today = new Date();
		generateLifeGrid(predictedLifespan, today);
		saveToLocalStorage(dateOfBirth, predictedLifespan);
  
		menu.style.display = 'none';
	  } else {
		alert('Please enter both your Date of Birth and Predicted Lifespan.');
	  }
	});
  
	// Load the stored values and apply them on page load
	loadFromLocalStorage();
  });
  