document.addEventListener('DOMContentLoaded', () => {

    // --- Embedded Assets ---
    const BETA_COLOUR_SVG = `data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgOTEwLjk5IDQyNy42MiI+PGRlZnM+PHN0eWxlPi5jbHMtMXtsZXR0ZXItc3BhY2luZzowZW19LmNscy0ye2ZvbnQtZmFtaWx5Olhlbm9pc1NvZnRXMDEtTWVkaXVtLFhlbm9pc1NvZnRXMDEtTWVkaXVtO2ZvbnQtc2l6ZToyNjguNDlweDtmb250LXdlaWdodDo1MDB9LmNscy0ze2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQtMil9LmNscy00e2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQpfS5jbHMtNXtsZXR0ZXItc3BhY2luZzotLjA2ZW19PC9zdHlsZT48bGluZWFyR3JhZGllbnQgaWQ9ImxpbmVhci1ncmFkaWVudCIgeDE9IjE4My40NyIgeTE9IjQ4NS44NCIgeDI9IjcyNy41MiIgeTI9Ii01OC4yMiIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iI2ZmZiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2UwZTBlMCIvPjwvbGluZWFyR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQtMiIgeDE9IjE2MC44MyIgeTE9IjIwNS42OSIgeDI9Ijc2NS43MyIgeTI9IjIwNS42OSIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzAwODBjOCIvPjxzdG9wIG9mZnNldD0iLjQ5IiBzdG9wLWNvbG9yPSIjODMzNTk0Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZjI5ODFmIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PGcgaWQ9IkxheWVyXzEtMiIgZGF0YS1uYW1lPSJMYXllciAxIj48Zz48cmVjdCBjbGFzcz0iY2xzLTQiIHg9IjAiIHk9IjAiIHdpZHRoPSI5MTAuOTkiIGhlaWdodD0iNDI3LjYyIiByeD0iMjEzLjgxIiByeT0iMjEzLjgxIi8+PGc+PHRleHQgY2xhc3M9ImNscy0yIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxMzcuMjEgMjk3LjExKSI+PHRzcGFuIHg9IjAiIHk9IjAiPkJFPC90c3Bhbj48dHNwYW4gY2xhc3M9ImNscy01IiB4PSIzMjYuNDgiIHk9IjAiPlQ8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTEiIHg9IjQ2MC45OSIgeT0iMCI+QTwvdHNwYW4+PC90ZXh0PjxnPjxwYXRoIGNsYXNzPSJjbHMtMyIgZD0iTTI5NCwyNDcuNzFjMCwxMC4wMy0xLjc1LDE4LjI2LTUuMjQsMjQuNy0zLjQ5LDYuNDQtOC4xNSwxMS41LTEzLjk2LDE1LjE3LTUuODIsMy42Ny0xMi40OCw2LjE3LTIwLDcuNTJzLTE1LjQsMi4wMS0yMy42MywyLjAxaC01My45N2MtNS45MSwwLTEwLjExLTEuMjUtMTIuNjItMy43Ni0yLjUxLTIuNS0zLjc2LTYuMDgtMy43Ni0xMC43NHYtMTUzLjU4YzAtNC42NSwxLjI1LTguMjMsMy43Ni0xMC43NCwyLjUtMi41LDYuNzEtMy43NiwxMi42Mi0zLjc2aDUzLjQzYzguNTksMCwxNi40Ny42NywyMy42MywyLjAxLDcuMTYsMS4zNCwxMy4yOSwzLjcyLDE4LjM5LDcuMTIsNS4xLDMuNCw5LjA4LDguMDEsMTEuOTUsMTMuODMsMi44Niw1LjgyLDQuMywxMy4yOSw0LjMsMjIuNDIsMCwxMS45OS0zLjE4LDIxLjU3LTkuNTMsMjguNzMtNi4zNiw3LjE2LTE1LjQ0LDExLjczLTI3LjI1LDEzLjY5LDE0LjE0LDEuNDMsMjQuNjUsNS43MywzMS41NSwxMi44OSw2Ljg5LDcuMTYsMTAuMzQsMTcuOTksMTAuMzQsMzIuNDlaTTI1OC41NiwxNjMuNGMwLTEwLjAyLTIuNDYtMTcuMDUtNy4zOC0yMS4wOC00LjkyLTQuMDMtMTMuMjktNi4wNC0yNS4xLTYuMDRoLTM1LjE3bC0uMjcsNTYuNjVoMzcuNTljNS45MSwwLDEwLjgzLS43NiwxNC43Ny0yLjI4LDMuOTQtMS41Miw3LjAyLTMuNjIsOS4yNi02LjMxLDIuMjQtMi42OCwzLjg1LTUuODEsNC44My05LjQuOTgtMy41OCwxLjQ4LTcuNDIsMS40OC0xMS41NFpNMjYzLjEzLDI0NS4wMmMwLTYuMDgtLjgxLTExLjE0LTIuNDItMTUuMTdzLTMuODktNy4yNS02Ljg1LTkuNjdjLTIuOTUtMi40Mi02LjU0LTQuMDctMTAuNzQtNC45Ny00LjIxLS44OS04LjgyLTEuMzQtMTMuODMtMS4zNGgtMzguNjZsLjI3LDYxLjQ4aDMzLjgzYzYuNjIsMCwxMi4zOS0uNDUsMTcuMzItMS4zNCw0LjkyLS44OSw4LjktMi40NiwxMS45NS00LjcsMy4wNC0yLjI0LDUuMzItNS4zMiw2Ljg1LTkuMjYsMS41Mi0zLjk0LDIuMjgtOC45NSwyLjI4LTE1LjA0WiIvPjxwYXRoIGNsYXNzPSJjbHMtMyIgZD0iTTQ0OS4xOSwyODUuMDNjMCwzLjc2LTEuMTcsNi43MS0zLjQ5LDguODYtMi4zMywyLjE1LTYuMTgsMy4yMi0xMS41NCwzLjIyaC04My43N2MtNS45MSwwLTEwLjExLTEuMjUtMTIuNjItMy43Ni0yLjUxLTIuNS0zLjc2LTYuMDgtMy43Ni0xMC43NHYtMTUzLjU4YzAtNC42NSwxLjI1LTguMjMsMy43Ni0xMC43NCwyLjUtMi41LDYuNzEtMy43NiwxMi42Mi0zLjc2aDgwLjU1YzUuMzcsMCw5LjIyLDEuMDMsMTEuNTQsMy4wOSwyLjMyLDIuMDYsMy40OSw0Ljk3LDMuNDksOC43M3MtMS4xNyw2LjcxLTMuNDksOC44NmMtMi4zMywyLjE1LTYuMTgsMy4yMi0xMS41NCwzLjIyaC02Ni44NXY1NC4yM2g2Mi4wMmM1LjM3LDAsOS4yMi45NCwxMS41NCwyLjgyLDIuMzIsMS44OCwzLjQ5LDQuNywzLjQ5LDguNDZzLTEuMTcsNi42Mi0zLjQ5LDguNTljLTIuMzMsMS45Ny02LjE4LDIuOTUtMTEuNTQsMi45NWgtNjIuMDJ2NTcuNzJoNzAuMDhjNS4zNywwLDkuMjIsMS4wMywxMS41NCwzLjA5LDIuMzIsMi4wNiwzLjQ5LDQuOTcsMy40OSw4LjczWiIvPjxwYXRoIGNsYXNzPSJjbHMtMyIgZD0iTTYwNi43OSwxMjcuMTZjMCwzLjc2LTEuMTcsNi44NS0zLjQ5LDkuMjYtMi4zMywyLjQyLTYuMTcsMy42Mi0xMS41NCwzLjYyaC0zNy41OXYxNDYuMzNjMCw0LjEyLTEuMTcsNy4zNC0zLjQ5LDkuNjctMi4zMywyLjMyLTYuMTgsMy40OS0xMS41NCwzLjQ5cy05LjIyLTEuMTctMTEuNTQtMy40OWMtMi4zMy0yLjMyLTMuNDktNS41NS0zLjQ5LTkuNjd2LTE0Ni4zM2gtMzcuODZjLTUuMzcsMC05LjIyLTEuMjEtMTEuNTQtMy42Mi0yLjMzLTIuNDItMy40OS01LjUtMy40OS05LjI2czEuMTYtNi44LDMuNDktOS4xMyw2LjE4LTMuNDksMTEuNTQtMy40OWgxMDUuNTJjNS4zNywwLDkuMjIsMS4xNywxMS41NCwzLjQ5LDIuMzIsMi4zMywzLjQ5LDUuMzcsMy40OSw5LjEzWiIvPjxwYXRoIGNsYXNzPSJjbHMtMyIgZD0iTTc2NS43MywyODcuOThjMCw0LjEyLTEuMzksNy4wNy00LjE2LDguODYtMi43OCwxLjc5LTYuMzEsMi42OC0xMC42LDIuNjgtNy43LDAtMTIuNjItMy40OS0xNC43Ny0xMC40N2wtMTIuODktMzguOTNoLTc2LjUybC0xMy4xNiwzOS43NGMtMi4xNSw2LjQ0LTYuOCw5LjY3LTEzLjk2LDkuNjdjLTguOTUsMC0xMy40Mi0zLjU4LTEzLjQyLTEwLjc0LDAtMS45Ny40NS00LjMsMS4zNC02Ljk4bDU1Ljg0LTE1Ny4wN2MxLjI1LTMuNTgsMy40OS02LjYyLDYuNzEtOS4xMywzLjIyLTIuNSw4LjUtMy43NiwxNS44NC0zLjc2czEyLjYyLDEuMjUsMTUuODQsMy43NmMzLjIyLDIuNTEsNS41NSw1LjU1LDYuOTgsOS4xM2w1NS44NCwxNTYuNTNjLjM2LjkuNjIsMi4wNi44MSwzLjQ5LjE4LDEuNDMuMjcsMi41MS4yNywzLjIyWk03MTYuMDYsMjI3LjMwbC0zMS4xNC05Mi4wOS0zMC44OCw5Mi4wOWg2Mi4wMloiLz48L2c+PC9nPjwvZz48L2c+PC9zdmc+`;
    const BETA_GRAYSCALE_SVG = `data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgOTEwLjk5IDQyNy42MiI+PGRlZnM+PHN0eWxlPi5jbHMtMXtsZXR0ZXItc3BhY2luZzowZW19LmNscy0ye2ZvbnQtZmFtaWx5Olhlbm9pc1NvZnRXMDEtTWVkaXVtLFhlbm9pc1NvZnRXMDEtTWVkaXVtO2ZvbnQtc2l6ZToyNjguNDlweDtmb250LXdlaWdodDo1MDB9LmNscy0ze2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQtMil9LmNscy00e2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQpfS5jbHMtNXtsZXR0ZXItc3BhY2luZzotLjA2ZW19PC9zdHlsZT48bGluZWFyR3JhZGllbnQgaWQ9ImxpbmVhci1ncmFkaWVudCIgeDE9IjE4My40NyIgeTE9IjQ4NS44NCIgeDI9IjcyNy41MiIgeTI9Ii01OC4yMiIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iI2ZmZiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2UwZTBlMCIvPjwvbGluZWFyR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQtMiIgeDE9IjM1MS40IiB5MT0iNDAxLjU4IiB4Mj0iNTYyLjg5IiB5Mj0iMzUuMjciIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMDAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9ImdyYXkiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48ZyBpZD0iTGF5ZXJfMS0yIiBkYXRhLW5hbWU9IkxheWVyIDEiPjxnPjxyZWN0IGNsYXNzPSJjbHMtNCIgeD0iMCIgeT0iMCIgd2lkdGg9IjkxMC45OSIgaGVpZ2h0PSI0MjcuNjIiIHJ4PSIyMTMuODEiIHJ5PSIyMTMuODEiLz48Zz48dGV4dCBjbGFzcz0iY2xzLTIiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEzNy4yMSAyOTcuMTEpIj48dHNwYW4geD0iMCIgeT0iMCI+QkU8L3RzcGFuPjx0c3BhbiBjbGFzcz0iY2xzLTUiIHg9IjMyNi40OCIgeT0iMCI+VDwvdHNwYW4+PHRzcGFuIGNsYXNzPSJjbHMtMSIgeD0iNDYwLjk5IiB5PSIwIj5BPC90c3Bhbj48L3RleHQ+PGc+PHBhdGggY2xhc3M9ImNscy0zIiBkPSJNMjk0LDI0Ny43MWMwLDEwLjAzLTEuNzUsMTguMjYtNS4yNCwyNC43LTMuNDksNi40NC04.MTUsMTEuNS0xMy45NiwxNS4xNy01LjgyLDMuNjctMTIuNDgsNi4xNy0yMCw3LjUycy0xNS40LDIuMDEtMjMuNjMsMi4wMWgtNTMuOTdjLTUuOTEsMC0xMC4xMS0xLjI1LTEyLjYyLTMuNzYtMi41MS0yLjUtMy43Ni02LjA4LTMuNzYtMTAuNzR2LTE1My41N2MwLTQuNjUsMS4yNS04LjIzLDMuNzYtMTAuNzRzNi43MS0zLjc2LDEyLjYyLTMuNzZoNTMuNDNjOC41OSwwLDE2LjQ3LjY3LDIzLjYzLDIuMDEsNy4xNiwxLjM0LDEzLjI5LDMuNzIsMTguMzksNy4xMiw1LjEsMy40LDkuMDgsOC4wMSwxMS45NSwxMy44MywyLjg2LDUuODIsNC4zLDEzLjI5LDQuMywyMi40MiwwLDExLjk5LTMuMTgsMjEuNTctOS41MywyOC43My02LjM2LDcuMTYtMTUuNDQsMTEuNzMtMjcuMjUsMTMuNjksMTQuMTQsMS40MywyNC42NSw1LjczLDMxLjU1LDEyLjg5LDYuODksNy4xNiwxMC4zNCwxNy45OSwxMC4zNCwzMi40OVpNMjU4LjU2LDE2My40YzAtMTAuMDItMi40Ni0xNy4wNS03LjM4LTIxLjA4LTQuOTItNC4wMy0xMy4yOS02LjA0LTI1LjEtNi4wNGgtMzUuMTdsLS4yNyw1Ni42NWgzNy41OWM1LjkxLDAsMTAuODMtLjc2LDE0Ljc3LTIuMjgsMy45NC0xLjUyLDcuMDItMy42Miw5LjI2LTYuMzEsMi4yNC0yLjY4LDMuODUtNS44MSw0LjgzLTkuNC45OC0zLjU4LDEuNDgtNy40MywxLjQ4LTExLjU0Wk0yNjMuMTMsMjQ1LjAyYzAtNi4wOC0uODEtMTEuMTQtMi40Mi0xNS4xN3MtMy44OS03LjI1LTYuODUtOS42N2MtMi45NS0yLjQyLTYuNTQtNC4wNy0xMC43NC00Ljk3LTQuMjEtLjg5LTguODItMS4zNC0xMy44My0xLjM0aC0zOC42NmwuMjcsNjEuNDhoMzMuODNjNi42MiwwLDEyMzktLjQ1LDE3LjMyLTEuMzQsNC45Mi0uODksOC45LTIuNDYsMTEuOTUtNC43LDMuMDQtMi4yNCw1LjMyLTUuMzIsNi44NS05LjI2LDEuNTItMy45NCwyLjI4LTguOTUsMi4yOC0xNS4wNFoiLz48cGF0aCBjbGFzcz0iY2xzLTMiIGQ9Ik00NDkuMTksMjg1LjAzYzAsMy43Ni0xLjE3LDYuNzEtMy40OSw4Ljg2LTIuMzMsMi4xNS02LjE4LDMuMjItMTEuNTQsMy4yMmgtODMuNzdjLTUuOTEsMC0xMC4xMS0xLjI1LTEyLjYyLTMuNzYtMi41MS0yLjUtMy43Ni02LjA4LTMuNzYtMTAuNzR2LTE1My41N2MwLTQuNjUsMS4yNS04LjIzLDMuNzYtMTAuNzRzNi43MS0zLjc2LDEyLjYyLTMuNzZoODAuNTVjNS4zNywwLDkuMjIsMS4wMywxMS41NCwzLjA5LDIuMzIsMi4wNiwzLjQ5LDQuOTcsMy40OSw4Ljczcy0xLjE3LDYuNzEtMy40OSw4Ljg2Yy0yLjMzLDIuMTUtNi4xOCwzLjIyLTExLjU0LDMuMjJoLTY2Ljg1djU0LjIzaDYyLjAyYzUuMzcsMCw5LjIyLjk0LDExLjU0LDIuODIsMi4zMiwxLjg4LDMuNDksNC43LDMuNDksOC40NnMtMS4xNyw2LjYyLTMuNDksOC41OWMtMi4zMywxLjk3LTYuMTgsMi45NS0xMS41NCwyLjk1aC02Mi4wMnY1Ny43Mmg3MC4wOGM1LjM3LDAsOS4yMiwxLjAzLDExLjU0LDMuMDksMi4zMiwyLjA2LDMuNDksNC45NywzLjQ5LDguNzNaIi8+PHBhdGggY2xhc3M9ImNscy0zIiBkPSJNNjA2Ljc5LDEyNy4xNmMwLDMuNzYtMS4xNyw2Ljg1LTMuNDksOS4yNi0yLjMzLDIuNDItNi4xNywzLjYyLTExLjU0LDMuNjJoLTM3LjU5djE0Ni4zM2MwLDQuMTItMS4xNyw3LjM0LTMuNDksOS42Ny0yLjMzLDIuMzItNi4xOCwzLjQ5LTExLjU0LDMuNDlzLTkuMjItMS4xNy0xMS41NC0zLjQ5Yy0yLjMzLTIuMzItMy40OS01LjU1LTMuNDktOS42N3YtMTQ2LjMzaC0zNy44NmMtNS4zNywwLTkuMjItMS4yMS0xMS41NC0zLjYyLTIuMzMtMi40Mi0zLjQ5LTUuNS0zLjQ5LTkuMjZzMS4xNi02LjgsMy40OS05LjEzLDYuMTgtMy40OSwxMS41NC0zLjQ5aDEwNS41MmM1LjM3LDAsOS4yMiwxLjE3LDExLjU0LDMuNDksMi4zMiwyLjMzLDMuNDksNS4zNywzLjQ5LDkuMTNaIi8+PHBhdGggY2xhc3M9ImNscy0zIiBkPSJNNzY1LjczLDI4Ny45OGMwLDQuMTItMS4zOSw3LjA3LTQuMTYsOC44Ni0yLjc4LDEuNzktNi4zMSwyLjY4LTEwLjYsMi42OC03LjcsMC0xMi42Mi0zLjQ5LTE0Ljc3LTEwLjQ3bC0xMi44OS0zOC45M2gtNzYuNTJsLTEzLjE2LDM5Ljc0Yy0yLjE1LDYuNDQtNi44LDkuNjctMTMuOTYsOS42N2MtOC45NSwwLTEzLjQyLTMuNTgtMTMuNDItMTAuNzQsMC0xLjk3LjQ1LTQuMywxLjM0LTYuOThsNTUuODQtMTU3LjA2YzEuMjUtMy41OCwzLjQ5LTYuNjIsNi43MS05LjEzLDMuMjItMi41LDguNS0zLjc2LDE1Ljg0LTMuNzZzMTIuNjIsMS4yNSwxNS44NCwzLjc2YzMuMjIsMi41MSw1LjU1LDUuNTUsNi45OCw5LjEzbDU1Ljg0LDE1Ni41M2MuMzYuOS42MiwyLjA2LjgxLDMuNDkuMTgsMS40My4yNywyLjUxLjI3LDMuMjJaTTcxNi4wNiwyMjcuMzBsLTMxLjE0LTkyLjA5LTMwLjg4LDkyLjA5aDYyLjAyWiIvPjwvZz48L2c+PC9nPjwvZz48L3N2Zz4=`;


    // --- DOM Elements ---
    const uploadInput = document.getElementById('image-upload');
    const uploadLabel = document.getElementById('upload-label');
    const imagePreview = document.getElementById('image-preview');
    const imageFilename = document.getElementById('image-filename');

    const svgControlsCard = document.getElementById('svg-controls-card');
    const rasterControls = document.getElementById('raster-controls');

    const svgPreviewWrapperLight = document.getElementById('svg-preview-wrapper-light');
    const svgPreviewWrapperDark = document.getElementById('svg-preview-wrapper-dark');
    const swapBtn = document.getElementById('swap-themes-btn');

    const bgControls = document.getElementById('bg-controls');
    const colorsSlider = document.getElementById('colors-slider');
    const colorsValue = document.getElementById('colors-value');
    const detailSlider = document.getElementById('detail-slider');
    const detailValue = document.getElementById('detail-value');
    const smoothingSlider = document.getElementById('smoothing-slider');
    const smoothingValue = document.getElementById('smoothing-value');

    // --- Padding Elements ---
    const paddingSlider = document.getElementById('padding-slider');
    const paddingValue = document.getElementById('padding-value');
    const paddingSmallIconsCheckbox = document.getElementById('padding-small-icons');
    const chromeExtToggle = document.getElementById('chrome-ext-toggle');
    const paddingPreviewIcon = document.getElementById('padding-preview-icon');

    // --- Background Elements ---
    const bgTransparentToggle = document.getElementById('bg-transparent-toggle');
    const bgColorPicker = document.getElementById('bg-color-picker');
    const bgColorCode = document.getElementById('bg-color-code');
    const bgApplyAllCheckbox = document.getElementById('bg-apply-all');
    const bgColorGroup = document.getElementById('bg-color-group');
    const bgAllGroup = document.getElementById('bg-all-group');

    // --- Squircle Elements ---
    const squircleToggle = document.getElementById('squircle-toggle');
    const squircleColorPicker = document.getElementById('squircle-color-picker');
    const squircleColorCode = document.getElementById('squircle-color-code');
    const squircleColorGroup = document.getElementById('squircle-color-group');
    const squirclePaddingSlider = document.getElementById('squircle-padding-slider');
    const squirclePaddingValue = document.getElementById('squircle-padding-value');
    const squirclePaddingGroup = document.getElementById('squircle-padding-group');
    const appleTouchNoSquircleToggle = document.getElementById('apple-touch-no-squircle-toggle');
    const appleTouchNoSquircleGroup = document.getElementById('apple-touch-no-squircle-group');

    // --- Beta Overlay Elements ---
    const overlayType = document.getElementById('overlay-type');
    const overlayControls = document.getElementById('overlay-controls');
    const overlaySizeSlider = document.getElementById('overlay-size-slider');
    const overlaySizeValue = document.getElementById('overlay-size-value');
    const overlayXSlider = document.getElementById('overlay-x-slider');
    const overlayXValue = document.getElementById('overlay-x-value');
    const overlayYSlider = document.getElementById('overlay-y-slider');
    const overlayYValue = document.getElementById('overlay-y-value');

    const generateBtn = document.getElementById('generate-btn');
    const resultsCard = document.getElementById('results-card');
    const resultsContent = document.getElementById('results-content');
    const generateStatus = document.getElementById('generate-status');
    const resetBtn = document.getElementById('reset-btn');

    // --- Mode Selector Elements ---
    const modeSelectorContainer = document.getElementById('mode-selector-container');
    const modeVectorInput = document.getElementById('mode-vector');
    const modeRasterInput = document.getElementById('mode-raster');

    // --- State Variables ---
    let sourceFile = null;
    let isVectorMode = false;
    let processingMode = 'vector'; // 'vector' (Trace to SVG) or 'raster' (Direct Resize)
    let sourceImageData = null; // For PNGs
    let sourceSvgText = null;   // For SVGs

    let lightSvgString = null;
    let darkSvgString = null;
    let baseLightSvgString = null;
    let baseDarkSvgString = null;
    let downloadBlob = null;
    let generatedFiles = {};

    // --- Helper: Canvas for Color Parsing ---
    // This allows us to convert "black", "red", "rgba(0,0,0,1)" to readable standard formats
    const ctxParser = document.createElement('canvas').getContext('2d');

    // --- Event Listeners ---
    uploadInput.addEventListener('change', e => handleFile(e.target.files[0]));
    uploadLabel.addEventListener('drop', e => { preventDefaults(e); handleFile(e.dataTransfer.files[0]); });
    ['dragenter', 'dragover', 'dragleave'].forEach(eventName => uploadLabel.addEventListener(eventName, preventDefaults));
    ['dragenter', 'dragover'].forEach(() => uploadLabel.classList.add('dragover'));
    ['dragleave', 'drop'].forEach(() => uploadLabel.classList.remove('dragover'));

    bgControls.addEventListener('click', handleBgChange);
    swapBtn.addEventListener('click', handleSwapThemes);

    // Mode Selector listeners
    document.querySelectorAll('input[name="icon-mode"]').forEach(input => {
        input.addEventListener('change', async (e) => {
            processingMode = e.target.value;
            await switchMode(processingMode);
        });
    });

    // Sliders only affect PNG tracing
    colorsSlider.addEventListener('input', () => handleSliderChange(colorsSlider, colorsValue));
    detailSlider.addEventListener('input', () => handleSliderChange(detailSlider, detailValue, 1));
    smoothingSlider.addEventListener('input', () => handleSliderChange(smoothingSlider, smoothingValue));

    paddingSlider.addEventListener('input', () => {
        paddingValue.textContent = paddingSlider.value + '%';
        updatePaddingPreview();
    });

    paddingSmallIconsCheckbox.addEventListener('change', () => {
        updatePaddingPreview();
    });

    // Background Controls Listeners
    bgTransparentToggle.addEventListener('change', () => {
        const isTransparent = bgTransparentToggle.checked;
        if (isTransparent) {
            bgColorGroup.style.opacity = '0.5';
            bgColorGroup.style.pointerEvents = 'none';
            bgAllGroup.style.opacity = '0.5';
            bgAllGroup.style.pointerEvents = 'none';
            updatePaddingPreviewWrapperBg('transparent');
        } else {
            bgColorGroup.style.opacity = '1';
            bgColorGroup.style.pointerEvents = 'auto';
            bgAllGroup.style.opacity = '1';
            bgAllGroup.style.pointerEvents = 'auto';
            updatePaddingPreviewWrapperBg(bgColorPicker.value);
        }
    });

    bgColorPicker.addEventListener('input', () => {
        bgColorCode.textContent = bgColorPicker.value;
        updatePaddingPreviewWrapperBg(bgColorPicker.value);
    });

    // --- Squircle Event Listeners ---
    squircleToggle.addEventListener('change', () => {
        const isSquircleActive = squircleToggle.checked;
        if (isSquircleActive) {
            squircleColorGroup.style.opacity = '1';
            squircleColorGroup.style.pointerEvents = 'auto';
            squirclePaddingGroup.style.opacity = '1';
            squirclePaddingGroup.style.pointerEvents = 'auto';
            appleTouchNoSquircleGroup.style.opacity = '1';
            appleTouchNoSquircleGroup.style.pointerEvents = 'auto';
        } else {
            squircleColorGroup.style.opacity = '0.5';
            squircleColorGroup.style.pointerEvents = 'none';
            squirclePaddingGroup.style.opacity = '0.5';
            squirclePaddingGroup.style.pointerEvents = 'none';
            appleTouchNoSquircleGroup.style.opacity = '0.5';
            appleTouchNoSquircleGroup.style.pointerEvents = 'none';
        }
        applySquircleToStateSvgs();
        renderPreviewsInDOM();
        updatePaddingPreview();
    });

    squircleColorPicker.addEventListener('input', () => {
        squircleColorCode.textContent = squircleColorPicker.value;
        applySquircleToStateSvgs();
        renderPreviewsInDOM();
        updatePaddingPreview();
    });

    appleTouchNoSquircleToggle.addEventListener('change', () => {
        applySquircleToStateSvgs();
        renderPreviewsInDOM();
        updatePaddingPreview();
    });

    squirclePaddingSlider.addEventListener('input', () => {
        squirclePaddingValue.textContent = squirclePaddingSlider.value + '%';
        applySquircleToStateSvgs();
        renderPreviewsInDOM();
        updatePaddingPreview();
    });

    // --- Overlay Event Listeners ---
    overlayType.addEventListener('change', () => {
        if (overlayType.value === 'none') {
            overlayControls.classList.add('hidden');
        } else {
            overlayControls.classList.remove('hidden');
        }
        updatePaddingPreview();
    });

    overlaySizeSlider.addEventListener('input', () => {
        overlaySizeValue.textContent = overlaySizeSlider.value + '%';
        updatePaddingPreview();
    });

    overlayXSlider.addEventListener('input', () => {
        overlayXValue.textContent = overlayXSlider.value + '%';
        updatePaddingPreview();
    });

    overlayYSlider.addEventListener('input', () => {
        overlayYValue.textContent = overlayYSlider.value + '%';
        updatePaddingPreview();
    });

    generateBtn.addEventListener('click', handleFinalGeneration);
    resultsContent.addEventListener('click', handleResultsClick);

    resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleReset();
    });

    // --- Main Functions ---
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    function handleFile(file) {
        if (!file) return;

        // Reset state
        sourceFile = file;
        uploadLabel.classList.add('uploaded');
        document.getElementById('upload-prompt').classList.add('hidden');
        document.getElementById('image-preview-container').classList.remove('hidden');
        resetBtn.classList.remove('hidden');
        imageFilename.textContent = file.name;

        // Detect Type
        isVectorMode = file.type.includes('svg');

        const reader = new FileReader();
        reader.onload = async (e) => {
            imagePreview.src = e.target.result;
            // Update padding preview source
            paddingPreviewIcon.style.backgroundImage = `url(${e.target.result})`;
            // Force update bg to match current controls 
            // (fixes issue where re-upload might not respect current bg selection)
            const isTransparent = bgTransparentToggle.checked;
            updatePaddingPreviewWrapperBg(isTransparent ? 'transparent' : bgColorPicker.value);

            if (isVectorMode) {
                // Enforce Vector mode for SVG files
                processingMode = 'vector';
                modeVectorInput.checked = true;
                modeSelectorContainer.classList.add('hidden');
                rasterControls.classList.add('hidden'); // Hide tracing sliders

                // Read content as text for manipulation
                const textReader = new FileReader();
                textReader.onload = async (textEvent) => {
                    sourceSvgText = textEvent.target.result;
                    svgControlsCard.classList.remove('hidden');
                    generateBtn.disabled = false;
                    await updateSvgPreviews();
                    generateBtn.classList.add('glow-animation');
                    updatePaddingPreview();
                };
                textReader.readAsText(file);

            } else {
                // Handle PNG Input
                if (file.type !== 'image/png') { alert('Please upload a PNG or SVG.'); return; }
                
                // Show mode selector
                modeSelectorContainer.classList.remove('hidden');
                processingMode = document.querySelector('input[name="icon-mode"]:checked')?.value || 'vector';

                try {
                    sourceImageData = await getImageDataFromSrc(imagePreview.src);
                    
                    if (processingMode === 'vector') {
                        rasterControls.classList.remove('hidden'); // Show tracing sliders
                        svgControlsCard.classList.remove('hidden');
                        await updateSvgPreviews();
                    } else {
                        svgControlsCard.classList.add('hidden');
                        lightSvgString = null;
                        darkSvgString = null;
                        baseLightSvgString = null;
                        baseDarkSvgString = null;
                    }
                    
                    generateBtn.disabled = false;
                    generateBtn.classList.add('glow-animation');
                    updatePaddingPreview();
                } catch (error) { console.error(error); alert("Could not process image."); }
            }
        };
        reader.readAsDataURL(file);
    }

    async function switchMode(newMode) {
        if (!sourceFile) return;

        if (newMode === 'raster') {
            svgControlsCard.classList.add('hidden');
            lightSvgString = null;
            darkSvgString = null;
            baseLightSvgString = null;
            baseDarkSvgString = null;
            generateBtn.disabled = false;
            generateBtn.classList.add('glow-animation');
            updatePaddingPreview();
        } else {
            svgControlsCard.classList.remove('hidden');
            if (isVectorMode) {
                rasterControls.classList.add('hidden');
            } else {
                rasterControls.classList.remove('hidden');
            }
            generateBtn.disabled = false;
            generateBtn.classList.add('glow-animation');
            
            // Re-run SVG processing
            await updateSvgPreviews();
            updatePaddingPreview();
        }
    }

    function handleBgChange(e) {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        const color = swatch.dataset.color;
        document.querySelectorAll('.svg-preview-wrapper').forEach(wrapper => {
            wrapper.style.backgroundImage = 'none';
            wrapper.dataset.bg = color;
            wrapper.style.backgroundColor = (color === 'transparent') ? 'transparent' : color;
        });
        bgControls.querySelector('.active').classList.remove('active');
        swatch.classList.add('active');
    }

    function handleSwapThemes() {
        if (!baseLightSvgString || !baseDarkSvgString) return;
        // Swap base strings
        const temp = baseLightSvgString;
        baseLightSvgString = baseDarkSvgString;
        baseDarkSvgString = temp;

        // Re-apply squircle
        applySquircleToStateSvgs();

        // Update DOM
        renderPreviewsInDOM();
        updatePaddingPreview();
    }

    const debouncedUpdate = debounce(() => updateSvgPreviews(), 250);
    function handleSliderChange(slider, valueSpan, fixed = 0) {
        valueSpan.textContent = parseFloat(slider.value).toFixed(fixed);
        debouncedUpdate();
        generateBtn.classList.add('glow-animation');
    }

    async function updateSvgPreviews() {
        svgPreviewWrapperLight.innerHTML = '<span>Processing...</span>';
        svgPreviewWrapperDark.innerHTML = '<span>Processing...</span>';

        try {
            if (isVectorMode) {
                // --- VECTOR PATH: Clean & Recoloring ---
                baseLightSvgString = cleanSvg(sourceSvgText);
                baseDarkSvgString = generateDarkSvg(baseLightSvgString);
            } else {
                // --- RASTER PATH: Tracing ---
                const settings = { colors: parseInt(colorsSlider.value), detail: parseFloat(detailSlider.value), smoothing: parseInt(smoothingSlider.value) };
                const lightPalette = await getSmartPalette(imagePreview.src, settings.colors);

                // 1. Trace PNG to create Light SVG
                const tracedSvg = traceImageDataToSvg(sourceImageData, lightPalette, settings);
                baseLightSvgString = cleanSvg(tracedSvg);
                // 2. Invert Traced SVG to create Dark SVG
                baseDarkSvgString = generateDarkSvg(baseLightSvgString);
            }

            // Apply squircle option
            applySquircleToStateSvgs();

            renderPreviewsInDOM();

        } catch (error) {
            console.error("SVG Processing failed:", error);
            svgPreviewWrapperLight.innerHTML = '<span style="color:red;">Error</span>';
        }
    }

    function renderPreviewsInDOM() {
        if (lightSvgString) svgPreviewWrapperLight.innerHTML = lightSvgString;
        if (darkSvgString) svgPreviewWrapperDark.innerHTML = darkSvgString;
    }

    // --- Core Logic: Cleaning & Coloring ---

    function cleanSvg(svgStr) {
        // Ensure SVG has viewBox and remove strict width/height
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgStr, "image/svg+xml");
        const svgEl = doc.querySelector('svg');
        if (!svgEl) return svgStr;

        let minX = 0, minY = 0, width = 100, height = 100;
        let hasSize = false;

        if (svgEl.hasAttribute('viewBox')) {
            const vb = svgEl.getAttribute('viewBox');
            const parts = vb.match(/-?[\d\.]+(?:e-?\d+)?/gi)?.map(parseFloat);
            if (parts && parts.length >= 4) {
                minX = parts[0];
                minY = parts[1];
                width = parts[2];
                height = parts[3];
                hasSize = true;
            }
        } else {
            const wAttr = svgEl.getAttribute('width');
            const hAttr = svgEl.getAttribute('height');
            if (wAttr && hAttr) {
                width = parseFloat(wAttr) || 100;
                height = parseFloat(hAttr) || 100;
                hasSize = true;
            }
        }

        if (hasSize && width !== height) {
            if (width > height) {
                const diff = width - height;
                minY = minY - diff / 2;
                height = width;
            } else {
                const diff = height - width;
                minX = minX - diff / 2;
                width = height;
            }
        }

        // Always set the squared viewBox
        svgEl.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        return new XMLSerializer().serializeToString(doc);
    }

    function generateDarkSvg(inputSvgStr) {
        if (!inputSvgStr) return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(inputSvgStr, "image/svg+xml");

        // Helper to process color
        const processColor = (colorStr) => {
            if (!colorStr || colorStr === 'none' || colorStr === 'transparent') return colorStr;
            const rgba = parseColorToRgb(colorStr);
            if (!rgba) return colorStr; // return original if parse fails
            return createDarkModeColor(rgba.r, rgba.g, rgba.b, rgba.a);
        };

        // Select shapes
        const elements = doc.querySelectorAll('path, circle, rect, polygon, polyline, ellipse, line, text, g');

        elements.forEach(el => {
            const fill = el.getAttribute('fill');
            const stroke = el.getAttribute('stroke');
            const style = el.getAttribute('style');

            // 1. Handle Explicit Fills
            if (fill && fill !== 'none') {
                el.setAttribute('fill', processColor(fill));
            }
            // 2. Handle Implicit Black Fills (No fill attribute = Black)
            else if (!fill && !style?.includes('fill') && el.tagName !== 'g') {
                // If it has no fill, SVG defaults to black.
                // We must force it to white for Dark Mode, UNLESS it's a stroked line.
                // If it has no stroke, or stroke is none, it's likely a filled shape.
                const hasStroke = stroke && stroke !== 'none';
                if (!hasStroke) {
                    el.setAttribute('fill', '#ffffff'); // Force white invert
                }
            }

            // 3. Handle Strokes
            if (stroke && stroke !== 'none') el.setAttribute('stroke', processColor(stroke));

            // 4. Handle Inline Styles
            if (style) {
                let newStyle = style.replace(/fill:\s*([^;"]+)/g, (m, c) => `fill:${processColor(c)}`);
                newStyle = newStyle.replace(/stroke:\s*([^;"]+)/g, (m, c) => `stroke:${processColor(c)}`);
                el.setAttribute('style', newStyle);
            }
        });

        return new XMLSerializer().serializeToString(doc);
    }

    // --- Color Math Helpers ---
    function parseColorToRgb(str) {
        str = str.trim();
        // Use browser's internal parser via Canvas
        ctxParser.fillStyle = str;
        let computed = ctxParser.fillStyle; // returns #rrggbb or rgba()

        let r = 0, g = 0, b = 0, a = 1;

        // Handle Hex #rrggbb
        if (computed.startsWith('#')) {
            const bigint = parseInt(computed.slice(1), 16);
            r = (bigint >> 16) & 255;
            g = (bigint >> 8) & 255;
            b = bigint & 255;
        }
        // Handle rgba() / rgb()
        else if (computed.startsWith('rgb')) {
            const parts = computed.match(/[\d.]+/g);
            if (parts && parts.length >= 3) {
                r = parseFloat(parts[0]);
                g = parseFloat(parts[1]);
                b = parseFloat(parts[2]);
                if (parts.length >= 4) {
                    a = parseFloat(parts[3]);
                }
            }
        }
        return { r, g, b, a };
    }

    function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2; if (max === min) { h = s = 0; } else { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return { h, s, l }; }
    function hslToRgb(h, s, l) { let r, g, b; if (s === 0) { r = g = b = l; } else { const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3); } return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }; }

    function isSkinTone({ h, s, l }) {
        const hue = h * 360;
        // Expanded range for oranges/browns (0-50 covers reds to yellow-oranges)
        // Ensure saturation is high enough to not be grey, but not necessarily neon
        return (hue >= 0 && hue <= 50) && (s >= 0.15 && s <= 1.0) && (l >= 0.15 && l <= 0.95);
    }
    function isGrayscale({ s }) { return s < 0.10; }

    function createDarkModeColor(r, g, b, a = 1) {
        // If fully transparent, remain fully transparent
        if (a === 0) return `rgba(0,0,0,0)`;

        const hsl = rgbToHsl(r, g, b);

        // 1. Preserve Skin Tones & Warm Colors (don't invert brown/orange to blue)
        if (isSkinTone(hsl)) {
            return `rgba(${r},${g},${b},${a})`;
        }

        // 2. Invert Grayscale (Black text -> White text)
        if (isGrayscale(hsl)) {
            const invertedL = 1.0 - hsl.l;
            const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, invertedL);
            return `rgba(${newR},${newG},${newB},${a})`;
        }

        // 3. Brighten other colors for Dark Backgrounds
        // (Slightly increase lightness to ensure visibility against dark bg)
        const newL = Math.max(0.70, hsl.l + 0.15);
        const { r: newR, g: newG, b: newB } = hslToRgb(hsl.h, hsl.s, Math.min(newL, 0.95));
        return `rgba(${newR},${newG},${newB},${a})`;
    }

    async function getSmartPalette(imgSrc, targetColorCount) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                // 1. Check for transparency first manually
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, img.width, img.height).data;

                let hasTransparency = false;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] < 250) { // Tolerance for semi-transparent
                        hasTransparency = true;
                        break;
                    }
                }

                const colorThief = new ColorThief();
                // ColorThief might fail on mostly transparent images, so wrap in try/catch or fallback
                let largePalette = [];
                try {
                    largePalette = colorThief.getPalette(img, 32);
                } catch (e) {
                    // If ColorThief fails (e.g. single color image), fallback to center pixel
                    largePalette = [[data[0], data[1], data[2]]];
                }

                if (!largePalette) largePalette = [];

                const uniqueColors = [];
                // If transparent, ensure we have a transparent color in palette
                if (hasTransparency) {
                    uniqueColors.push({ r: 0, g: 0, b: 0, a: 0 });
                }

                const similarityThreshold = 30;
                for (const color of largePalette) {
                    const rgb = { r: color[0], g: color[1], b: color[2], a: 255 };
                    let isUnique = true;
                    for (const uniqueColor of uniqueColors) {
                        if (colorDifference(rgb, uniqueColor) < similarityThreshold) {
                            isUnique = false;
                            break;
                        }
                    }
                    if (isUnique) uniqueColors.push(rgb);
                }

                // Sort by "interest" (saturation/lightness)
                // Filter out the transparent one from sort so it stays first? Or just sort everything.
                // ImageTracer expects palette to include the colors to map to.

                // We actually want to KEEP transparent at index 0 if possible for consistency, 
                // but ImageTracer just tries to match closest RGBA.

                const finalPalette = uniqueColors.slice(0, targetColorCount + (hasTransparency ? 1 : 0));

                // Ensure all have 4 components for ImageTracer
                // (Existing logic: map c => ... a:255 was bad)
                resolve(finalPalette);
            };
            img.onerror = reject;
            img.src = imgSrc;
        });
    }
    function colorDifference(c1, c2) {
        // Simple Euclidean distance including Alpha
        const rAvg = (c1.r + c2.r) / 2;
        const rDiff = c1.r - c2.r;
        const gDiff = c1.g - c2.g;
        const bDiff = c1.b - c2.b;
        const aDiff = (c1.a - c2.a);
        // Weight alpha heavily so transparent != black
        return Math.sqrt(2 * rDiff * rDiff + 4 * gDiff * gDiff + 3 * bDiff * bDiff + aDiff * aDiff * 10);
    }

    async function createIcoFile(pngBlobsWithSizes) {
        const pngBuffers = await Promise.all(
            pngBlobsWithSizes.map(async (item) => {
                const buffer = await item.blob.arrayBuffer();
                return {
                    size: item.size,
                    buffer: buffer
                };
            })
        );

        const numImages = pngBuffers.length;
        const headerSize = 6;
        const entrySize = 16;
        
        let currentOffset = headerSize + (numImages * entrySize);
        const totalSize = currentOffset + pngBuffers.reduce((acc, item) => acc + item.buffer.byteLength, 0);
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        
        // 1. Write ICONDIR Header
        view.setUint16(0, 0, true);         // Reserved (must be 0)
        view.setUint16(2, 1, true);         // Type: 1 = ICO
        view.setUint16(4, numImages, true);   // Number of images
        
        // 2. Write Directory Entries (ICONDIRENTRY) and Copy PNG Data
        pngBuffers.forEach((item, i) => {
            const entryOffset = headerSize + (i * entrySize);
            const pngSize = item.size;
            const pngBytes = item.buffer;
            
            // Width and Height: 1 byte each (0 represents 256)
            view.setUint8(entryOffset, pngSize >= 256 ? 0 : pngSize);
            view.setUint8(entryOffset + 1, pngSize >= 256 ? 0 : pngSize);
            
            // Color count (0 if >= 8bpp)
            view.setUint8(entryOffset + 2, 0);
            
            // Reserved (must be 0)
            view.setUint8(entryOffset + 3, 0);
            
            // Color planes
            view.setUint16(entryOffset + 4, 1, true);
            
            // Bits per pixel (32 bpp for typical PNGs)
            view.setUint16(entryOffset + 6, 32, true);
            
            // Size of the PNG image data (4 bytes)
            view.setUint32(entryOffset + 8, pngBytes.byteLength, true);
            
            // Offset of the PNG image data from the beginning of file (4 bytes)
            view.setUint32(entryOffset + 12, currentOffset, true);
            
            // Copy PNG data into the ArrayBuffer at currentOffset
            new Uint8Array(buffer, currentOffset, pngBytes.byteLength).set(new Uint8Array(pngBytes));
            
            currentOffset += pngBytes.byteLength;
        });
        
        return new Blob([buffer], { type: 'image/x-icon' });
    }

    // --- Final Generation & Output ---
    async function handleFinalGeneration() {
        if (!sourceFile) return;
        generateBtn.classList.remove('glow-animation');
        generateBtn.disabled = true; generateBtn.textContent = 'Generating...'; resultsCard.classList.remove('hidden'); updateStatus('Processing icons...');
        try {
            // Collect all unique icon sizes needed
            const baseSizes = [16, 32, 180, 192, 512];
            if (chromeExtToggle.checked) {
                baseSizes.push(48, 128);
            }

            // Get selected ICO sizes from checkboxes
            let selectedIcoSizes = Array.from(document.querySelectorAll('.ico-size-checkbox:checked'))
                .map(cb => parseInt(cb.value));
            if (selectedIcoSizes.length === 0) {
                selectedIcoSizes = [32]; // Default fallback
            }

            // Merge and de-duplicate all sizes
            const iconSizes = Array.from(new Set([...baseSizes, ...selectedIcoSizes]));
            const imageBlobs = {};

            // If we are in Vector Mode, we need to rasterize the SVG to PNGs first
            let pngSourceBlob = sourceFile;

            if (isVectorMode) {
                updateStatus('Rasterizing SVG...');
                // We use the Light SVG (Original) for the PNG fallbacks
                pngSourceBlob = await svgToPngBlob(baseLightSvgString, 1024);
            }

            for (const size of iconSizes) {
                const options = { maxSizeMB: 1, maxWidthOrHeight: size, useWebWorker: true };
                const compressedFile = await imageCompression(pngSourceBlob, options);

                // Determine padding for this size
                let paddingPercent = 0;
                const userPadding = parseInt(paddingSlider.value) / 100;

                // Apply padding logic
                // Apple Touch (180) and Android (192, 512) -> Default to user padding
                const isTouchIcon = [180, 192, 512].includes(size);
                if (isTouchIcon) {
                    paddingPercent = userPadding;
                } else {
                    // Small icons (16, 32) -> Checkbox dependent
                    if (paddingSmallIconsCheckbox.checked) {
                        paddingPercent = userPadding;
                    }
                }

                // Determine background color
                let backgroundColor = null; // null triggers transparency in convertToSquare

                // Only apply background if "Apply to all" is explicitly checked
                // The user requested that the preview background (which defaults to white) 
                // should NOT automatically apply to output images.
                // Updated Logic: Always apply background for Apple Touch Icon (180) unless explicitly transparent
                // For other sizes, respect "Apply to all" checkbox
                const isAppleTouch = (size === 180);
                const skipSquircleForApple = isAppleTouch && squircleToggle.checked && appleTouchNoSquircleToggle.checked;

                if (!bgTransparentToggle.checked) {
                    if (isAppleTouch || bgApplyAllCheckbox.checked) {
                        backgroundColor = bgColorPicker.value;
                    }
                } else if (skipSquircleForApple) {
                    // Force background color for Apple Touch Icon if squircle is skipped and transparent is set
                    backgroundColor = bgColorPicker.value;
                }

                let squircleColor = squircleToggle.checked ? squircleColorPicker.value : null;
                if (skipSquircleForApple) {
                    squircleColor = null;
                }

                imageBlobs[size] = await convertToSquare(compressedFile, size, paddingPercent, backgroundColor, squircleColor);
            }

            updateStatus('Preparing files...');
            generatedFiles = {};

            generatedFiles['apple-touch-icon.png'] = imageBlobs[180];
            generatedFiles['favicon-16x16.png'] = imageBlobs[16];
            generatedFiles['favicon-32x32.png'] = imageBlobs[32];
            generatedFiles['android-chrome-192x192.png'] = imageBlobs[192];
            generatedFiles['android-chrome-512x512.png'] = imageBlobs[512];

            // Generate standard ICO file using selected resolutions
            const icoBlobsWithSizes = selectedIcoSizes.map(size => ({
                size: size,
                blob: imageBlobs[size]
            }));
            const icoBlob = await createIcoFile(icoBlobsWithSizes);
            generatedFiles['favicon.ico'] = icoBlob;

            // Add Chrome extension icons if toggle is on
            if (chromeExtToggle.checked) {
                generatedFiles['icon16.png'] = imageBlobs[16];
                generatedFiles['icon32.png'] = imageBlobs[32];
                generatedFiles['icon48.png'] = imageBlobs[48];
                generatedFiles['icon128.png'] = imageBlobs[128];
            }

            // Add the SVGs currently displayed in preview
            let finalLightSvg = lightSvgString;
            let finalDarkSvg = darkSvgString;

            if (overlayType.value !== 'none') {
                const settings = {
                    type: overlayType.value,
                    size: parseInt(overlaySizeSlider.value),
                    x: parseInt(overlayXSlider.value),
                    y: parseInt(overlayYSlider.value)
                };
                if (finalLightSvg) finalLightSvg = addOverlayToSvg(finalLightSvg, settings);
                if (finalDarkSvg) finalDarkSvg = addOverlayToSvg(finalDarkSvg, settings);
            }

            if (finalLightSvg) {
                generatedFiles['favicon-light.svg'] = new Blob([finalLightSvg], { type: 'image/svg+xml' });
            }
            if (finalDarkSvg) {
                generatedFiles['favicon-dark.svg'] = new Blob([finalDarkSvg], { type: 'image/svg+xml' });
            }

            // Generate and add site.webmanifest
            let themeColor = '#ffffff';
            if (!bgTransparentToggle.checked) {
                themeColor = bgColorPicker.value;
            }
            const manifestJson = {
                name: "",
                short_name: "",
                icons: [
                    {
                        src: "android-chrome-192x192.png",
                        sizes: "192x192",
                        type: "image/png"
                    },
                    {
                        src: "android-chrome-512x512.png",
                        sizes: "512x512",
                        type: "image/png"
                    }
                ],
                theme_color: themeColor,
                background_color: themeColor,
                display: "standalone"
            };
            generatedFiles['site.webmanifest'] = new Blob([JSON.stringify(manifestJson, null, 4)], { type: 'application/json' });

            // Create ZIP from generatedFiles
            updateStatus('Creating ZIP file...');
            const zip = new JSZip();
            for (const [filename, blob] of Object.entries(generatedFiles)) {
                zip.file(filename, blob);
            }

            downloadBlob = await zip.generateAsync({ type: 'blob' });

            updateStatus('Generating HTML code...');
            generateResultsCode(!!lightSvgString);
            updateStatus('Done! Your files are ready.');

            // Auto scroll down to download zip button
            setTimeout(() => {
                const downloadBtnEl = document.getElementById('download-zip-btn');
                if (downloadBtnEl) {
                    downloadBtnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);

        } catch (error) {
            console.error("Final generation failed:", error); updateStatus(`Error: ${error.message}`);
        } finally { generateBtn.disabled = false; generateBtn.textContent = 'Generate All Files'; }
    }

    function generateResultsCode(hasCustomSvg) {
        const pngCode = `&lt;!-- Fallback PNG icons --&gt;
&lt;link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png"&gt;
&lt;link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png"&gt;
&lt;link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png"&gt;`;

        const svgCode = hasCustomSvg ? `&lt;!-- Theme-aware SVG icons (modern browsers) --&gt;
&lt;link rel="icon" href="favicon.ico" sizes="any"&gt; &lt;!-- Fallback for older browsers --&gt;
&lt;link rel="icon" href="favicon-light.svg" type="image/svg+xml" media="(prefers-color-scheme: light)"&gt;
&lt;link rel="icon" href="favicon-dark.svg" type="image/svg+xml" media="(prefers-color-scheme: dark)"&gt;` : '&lt;link rel="icon" href="favicon.ico" sizes="any"&gt;';

        const manifestCode = `&lt;!-- Other essential links --&gt;
&lt;link rel="manifest" href="site.webmanifest"&gt;
&lt;meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"&gt;
&lt;meta name="theme-color" content="#111115" media="(prefers-color-scheme: dark)"&gt;`;

        let filesHtml = '';
        for (const [filename, blob] of Object.entries(generatedFiles)) {
            let previewContent = '';
            let isVisual = filename.endsWith('.png') || filename.endsWith('.svg') || filename.endsWith('.ico');
            
            if (isVisual) {
                const url = URL.createObjectURL(blob);
                previewContent = `<img src="${url}" class="file-preview-image" alt="${filename}">`;
            } else {
                let iconSvg = '';
                if (filename.endsWith('.webmanifest') || filename.endsWith('.json')) {
                    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M9 1.5V4h2.5L9 1.5zM8 4H4.5A1.5 1.5 0 0 0 3 5.5v7A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6H9a1 1 0 0 1-1-1zM1.5 2A1.5 1.5 0 0 0 0 3.5v7A1.5 1.5 0 0 0 1.5 12H2V3a2 2 0 0 1 2-2h5v-.5A1.5 1.5 0 0 0 7.5 0h-6z"/></svg>`;
                } else {
                    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16"><path d="M.002 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2V3zm1 9v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1H1.002zm14-1V3a1 1 0 0 0-1-1h-12a1 1 0 0 0-1 1v8h14z"/></svg>`;
                }
                previewContent = `<div class="file-icon-placeholder">${iconSvg}</div>`;
            }
            
            const sizeStr = formatBytes(blob.size);
            
            filesHtml += `
                <div class="file-grid-item">
                    <div class="file-preview-area">
                        ${previewContent}
                    </div>
                    <div class="file-grid-info">
                        <div class="file-name" title="${filename}">${filename}</div>
                        <div class="file-size">${sizeStr}</div>
                    </div>
                    <button class="individual-download-btn" data-filename="${filename}" title="Download ${filename}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    </button>
                </div>
            `;
        }

        resultsContent.innerHTML = `
            <div class="result-box">
                <h3>HTML Code for &lt;head&gt;</h3>
                <div class="code-block-wrapper">
                    <button class="copy-btn" title="Copy to clipboard" data-target="code-block-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 1.5A1.5 1.5 0 0 1 .5 0h3A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-3A1.5 1.5 0 0 1-1 2.5v-1z"/></svg>
                    </button>
                    <pre><code id="code-block-1">${svgCode}\n\n${pngCode}\n\n${manifestCode}</code></pre>
                </div>
            </div>
            <div class="result-box">
                <h3>Download Options</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%;">
                    <button id="download-zip-btn" class="download-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                        Download .zip (All Files)
                    </button>
                    <div class="individual-downloads">
                        <h4>Download Individual Files</h4>
                        <div class="files-list">
                            ${filesHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function handleResultsClick(e) {
        const downloadBtn = e.target.closest('#download-zip-btn');
        if (downloadBtn && downloadBlob) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(downloadBlob);

            // Generate Filename
            let zipFileName = 'favicons.zip';
            if (sourceFile && sourceFile.name) {
                const nameParts = sourceFile.name.split('.');
                if (nameParts.length > 1) nameParts.pop();
                const baseName = nameParts.join('.');
                zipFileName = `${baseName}_icon_pack.zip`;
            }
            a.download = zipFileName;

            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        const individualDownloadBtn = e.target.closest('.individual-download-btn');
        if (individualDownloadBtn) {
            const fileName = individualDownloadBtn.dataset.filename;
            const blob = generatedFiles[fileName];
            if (blob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const codeEl = document.getElementById(copyBtn.dataset.target);
            navigator.clipboard.writeText(codeEl.innerText).then(() => {
                copyBtn.innerHTML = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zM-1 1.5A1.5 1.5 0 0 1 .5 0h3A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-3A1.5 1.5 0 0 1-1 2.5v-1z"/></svg>`; }, 2000);
            });
        }
    }

    // --- Utility Functions ---
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    function debounce(func, delay) { let timeout; return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; }
    function getImageDataFromSrc(imgSrc) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "Anonymous"; img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); resolve(ctx.getImageData(0, 0, img.width, img.height)); }; img.onerror = reject; img.src = imgSrc; }); }
    function traceImageDataToSvg(imageData, palette, settings) { const options = { pal: palette, numberofcolors: palette.length, ltres: settings.detail, qtres: settings.detail, roundcoords: settings.smoothing }; let svgString = ImageTracer.imagedataToSVG(imageData, options); const viewBox = `viewBox="0 0 ${imageData.width} ${imageData.height}"`; return svgString.replace('<svg ', `<svg ${viewBox} `); }

    function convertToSquare(blob, size, paddingPercent = 0, backgroundColor = null, squircleColor = null) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            const squirclePaddingPercent = squircleColor ? ((parseInt(squirclePaddingSlider.value) || 0) / 100) : 0;
            const squircleSize = size * (1 - 2 * squirclePaddingPercent);
            const squircleOffset = size * squirclePaddingPercent;

            if (squircleColor) {
                const pathString = generateSquirclePath(squircleOffset, squircleOffset, squircleSize, squircleSize);
                const path = new Path2D(pathString);
                ctx.fillStyle = squircleColor;
                ctx.fill(path);
            } else if (backgroundColor) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, size, size);
            }

            const img = new Image();
            img.onload = async () => {
                const availableSize = squircleSize * (1 - (paddingPercent * 2));
                const offset = squircleOffset + squircleSize * paddingPercent;

                const scale = Math.min(availableSize / img.width, availableSize / img.height);
                const newWidth = img.width * scale;
                const newHeight = img.height * scale;
                const x = offset + (availableSize - newWidth) / 2;
                const y = offset + (availableSize - newHeight) / 2;

                ctx.drawImage(img, x, y, newWidth, newHeight);

                // --- Draw Beta Overlay ---
                const overlaySelection = overlayType.value;
                if (overlaySelection !== 'none') {
                    const overlaySrc = (overlaySelection === 'colour') ? BETA_COLOUR_SVG : BETA_GRAYSCALE_SVG;
                    const overlayImg = new Image();
                    overlayImg.onload = () => {
                        // Calculate overlay size
                        const overlayScale = parseInt(overlaySizeSlider.value) / 100;
                        const overlayW = size * overlayScale * 2; // Beta tag is wide (approx 2:1), maximize width influence
                        const overlayH = overlayW * (427 / 911); // Aspect ratio from SVG viewbox

                        // Calculate position based on sliders (which are %)
                        // 0% = Left/Top edge, 100% = Right/Bottom edge
                        // We center anchor the overlay at that position for better control?
                        // Or just simplistic top-left coordinate mapping?
                        // Let's do: PositionSlider determines CENTER of overlay relative to canvas

                        // Revised: Let's make 100% X mean "Right aligned" and 0% X mean "Left aligned"
                        // But sticking to simple x/y percentage of canvas size is more standard.

                        const posX = (parseInt(overlayXSlider.value) / 100) * size - (overlayW / 2);
                        const posY = (parseInt(overlayYSlider.value) / 100) * size - (overlayH / 2);

                        ctx.drawImage(overlayImg, posX, posY, overlayW, overlayH);
                        canvas.toBlob(resolve, 'image/png');
                    };
                    overlayImg.onerror = () => {
                        // Fallback if overlay fails, just return icon
                        canvas.toBlob(resolve, 'image/png');
                    }
                    overlayImg.src = overlaySrc;
                } else {
                    canvas.toBlob(resolve, 'image/png');
                }
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    async function updatePaddingPreview() {
        const val = parseInt(paddingSlider.value);
        // We will generate a temporary single blob for the preview to show exactly what's going on
        // Use a decent size for preview, e.g. 128px
        const previewSize = 128;
        const paddingPercent = val / 100;

        let fileToUse = sourceFile;
        // If vector mode (either uploaded SVG, or PNG traced to SVG in vector mode)
        if (processingMode === 'vector' && baseLightSvgString) {
            fileToUse = await svgToPngBlob(baseLightSvgString, 256);
        } else if (!fileToUse && sourceImageData) {
            // Should not happen as sourceFile is set on upload, but for safety
        }

        if (!fileToUse) return;

        // Background handling for preview
        let backgroundColor = null;
        if (!bgTransparentToggle.checked) {
            backgroundColor = bgColorPicker.value;
        }

        let squircleColor = squircleToggle.checked ? squircleColorPicker.value : null;

        try {
            const blob = await convertToSquare(fileToUse, previewSize, paddingPercent, backgroundColor, squircleColor);
            const url = URL.createObjectURL(blob);
            paddingPreviewIcon.style.backgroundImage = `url(${url})`;
            paddingPreviewIcon.style.backgroundSize = 'contain'; // now the image itself contains the padding/overlay
        } catch (e) {
            console.error("Preview update error", e);
        }
    }

    function updateStatus(message) { generateStatus.textContent = message; }
    // New: Add Overlay to SVG String
    function addOverlayToSvg(svgStr, settings) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgStr, "image/svg+xml");
            const svgEl = doc.querySelector('svg');
            if (!svgEl) return svgStr;

            // Determine ViewBox / Size
            let vb = svgEl.getAttribute('viewBox');
            let minX = 0, minY = 0, width, height;

            if (vb) {
                // Robust parsing of "min-x min-y width height"
                // Match numbers including decimals and negatives
                const parts = vb.match(/-?[\d\.]+(?:e-?\d+)?/gi)?.map(parseFloat);
                if (parts && parts.length >= 4) {
                    minX = parts[0];
                    minY = parts[1];
                    width = parts[2];
                    height = parts[3];
                }
            }

            // Fallback to width/height attributes if ViewBox failed or missing
            if (width === undefined || height === undefined) {
                width = parseFloat(svgEl.getAttribute('width')) || 100;
                height = parseFloat(svgEl.getAttribute('height')) || 100;
                // If we fallback, assume 0,0 origin unless we force a new viewBox
                if (!vb) {
                    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
                }
            }

            // Calculate Overlay position/size
            // Use Math.min for consistent behavior with PNG generation (convertToSquare)
            // This ensures the overlay scales properly relative to the smaller dimension
            const canvasSize = Math.min(width, height);
            const overlayScale = settings.size / 100;
            const overlayW = canvasSize * overlayScale * 2;
            const overlayH = overlayW * (427 / 911); // Maintain aspect ratio from SVG viewbox

            // Position relative to minX/minY (ViewBox origin)
            // Use width/height for positioning to map 0-100% correctly across the full canvas
            const posX = minX + (settings.x / 100) * width - (overlayW / 2);
            const posY = minY + (settings.y / 100) * height - (overlayH / 2);

            const overlaySrc = (settings.type === 'colour') ? BETA_COLOUR_SVG : BETA_GRAYSCALE_SVG;

            // Create Image Element
            const imgEl = doc.createElementNS("http://www.w3.org/2000/svg", "image");
            imgEl.setAttributeNS(null, "x", posX);
            imgEl.setAttributeNS(null, "y", posY);
            imgEl.setAttributeNS(null, "width", overlayW);
            imgEl.setAttributeNS(null, "height", overlayH);
            // Redundant style for robustness in some viewers
            imgEl.style.width = `${overlayW}px`;
            imgEl.style.height = `${overlayH}px`;

            imgEl.setAttributeNS(null, "preserveAspectRatio", "xMidYMid meet");

            imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", overlaySrc);
            imgEl.setAttribute("href", overlaySrc);

            svgEl.appendChild(imgEl);

            return new XMLSerializer().serializeToString(doc);
        } catch (e) {
            console.error("Failed to add SVG overlay", e);
            return svgStr;
        }
    }

    // New: Rasterize SVG to a PNG blob
    function svgToPngBlob(svgStr, size) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            // Encode SVG to Base64 to load into Image
            const svg64 = btoa(unescape(encodeURIComponent(svgStr)));
            const b64Start = 'data:image/svg+xml;base64,';
            img.onload = () => {
                const scale = Math.min(size / img.width, size / img.height);
                const newWidth = img.width * scale;
                const newHeight = img.height * scale;
                const x = (size - newWidth) / 2;
                const y = (size - newHeight) / 2;

                ctx.drawImage(img, x, y, newWidth, newHeight);
                canvas.toBlob(resolve, 'image/png');
            };
            img.onerror = reject;
            img.src = b64Start + svg64;
        });
    }

    function handleReset() {
        sourceFile = null;
        isVectorMode = false;
        processingMode = 'vector';
        sourceImageData = null;
        sourceSvgText = null;
        lightSvgString = null;
        darkSvgString = null;
        baseLightSvgString = null;
        baseDarkSvgString = null;
        downloadBlob = null;
        generatedFiles = {};

        // Reset mode selector
        modeSelectorContainer.classList.add('hidden');
        modeVectorInput.checked = true;

        uploadInput.value = '';
        uploadLabel.classList.remove('uploaded');
        document.getElementById('upload-prompt').classList.remove('hidden');
        document.getElementById('image-preview-container').classList.add('hidden');
        resetBtn.classList.add('hidden');
        imagePreview.src = '#';
        imageFilename.textContent = '';

        // Reset/Hide preview
        paddingPreviewIcon.style.backgroundImage = 'none';
        updatePaddingPreviewWrapperBg('#ffffff'); // Default to white

        svgControlsCard.classList.add('hidden');
        resultsCard.classList.add('hidden');
        generateBtn.disabled = true;

        svgPreviewWrapperLight.innerHTML = '';
        svgPreviewWrapperDark.innerHTML = '';
        resultsContent.innerHTML = '';
        generateStatus.textContent = '';
        generateBtn.textContent = 'Generate All Files';

        // Reset overlay controls
        overlayType.value = 'none';
        overlayControls.classList.add('hidden');
        overlaySizeSlider.value = 40; overlaySizeValue.textContent = '40%';
        overlayXSlider.value = 100; overlayXValue.textContent = '100%';
        overlayYSlider.value = 0; overlayYValue.textContent = '0%';

        // Reset squircle controls
        squircleToggle.checked = false;
        squircleColorPicker.value = '#8b5cf6';
        squircleColorCode.textContent = '#8b5cf6';
        squircleColorGroup.style.opacity = '0.5';
        squircleColorGroup.style.pointerEvents = 'none';
        squirclePaddingSlider.value = 0;
        squirclePaddingValue.textContent = '0%';
        squirclePaddingGroup.style.opacity = '0.5';
        squirclePaddingGroup.style.pointerEvents = 'none';
        appleTouchNoSquircleToggle.checked = false;
        appleTouchNoSquircleGroup.style.opacity = '0.5';
        appleTouchNoSquircleGroup.style.pointerEvents = 'none';

        paddingSmallIconsCheckbox.checked = true;

        // Reset ICO resolution checkboxes
        document.getElementById('ico-size-16').checked = true;
        document.getElementById('ico-size-32').checked = true;
        document.getElementById('ico-size-48').checked = true;
        document.getElementById('ico-size-64').checked = false;
        document.getElementById('ico-size-128').checked = false;
        document.getElementById('ico-size-256').checked = false;
    }

    function updatePaddingPreviewWrapperBg(color) {
        // The preview box is .padding-preview-box
        const box = document.querySelector('.padding-preview-box');
        if (box) {
            box.style.backgroundColor = (color === 'transparent') ? '#000' : color;
            // If transparent, we revert to default black or checkerboard. 
            // The CSS default for .padding-preview-box is black (#000).
        }
    }

    // --- Squircle Logic ---
    function generateSquirclePath(minX, minY, w, h) {
        const sx = w / 223.2;
        const sy = h / 223.2;

        const f = (val) => Number(val.toFixed(4));

        // M 161.9 220.3
        const m_x = f(minX + 161.9 * sx);
        const m_y = f(minY + 220.3 * sy);

        // c -33.53 3.88 -67.06 3.88 -100.6 0
        const c1_dx1 = f(-33.53 * sx);
        const c1_dy1 = f(3.88 * sy);
        const c1_dx2 = f(-67.06 * sx);
        const c1_dy2 = f(3.88 * sy);
        const c1_dx3 = f(-100.6 * sx);
        const c1_dy3 = f(0 * sy);

        // c -30.6 -3.54 -54.86 -27.8 -58.4 -58.4
        const c2_dx1 = f(-30.6 * sx);
        const c2_dy1 = f(-3.54 * sy);
        const c2_dx2 = f(-54.86 * sx);
        const c2_dy2 = f(-27.8 * sy);
        const c2_dx3 = f(-58.4 * sx);
        const c2_dy3 = f(-58.4 * sy);

        // c -3.88 -33.53 -3.88 -67.06 0 -100.6
        const c3_dx1 = f(-3.88 * sx);
        const c3_dy1 = f(-33.53 * sy);
        const c3_dx2 = f(-3.88 * sx);
        const c3_dy2 = f(-67.06 * sy);
        const c3_dx3 = f(0 * sx);
        const c3_dy3 = f(-100.6 * sy);

        // C 6.44 30.7 30.7 6.44 61.3 2.91
        const c4_x1 = f(minX + 6.44 * sx);
        const c4_y1 = f(minY + 30.7 * sy);
        const c4_x2 = f(minX + 30.7 * sx);
        const c4_y2 = f(minY + 6.44 * sy);
        const c4_x3 = f(minX + 61.3 * sx);
        const c4_y3 = f(minY + 2.91 * sy);

        // c 33.53 -3.88 67.06 -3.88 100.6 0
        const c5_dx1 = f(33.53 * sx);
        const c5_dy1 = f(-3.88 * sy);
        const c5_dx2 = f(67.06 * sx);
        const c5_dy2 = f(-3.88 * sy);
        const c5_dx3 = f(100.6 * sx);
        const c5_dy3 = f(0 * sy);

        // c 30.6 3.54 54.86 27.8 58.4 58.4
        const c6_dx1 = f(30.6 * sx);
        const c6_dy1 = f(3.54 * sy);
        const c6_dx2 = f(54.86 * sx);
        const c6_dy2 = f(27.8 * sy);
        const c6_dx3 = f(58.4 * sx);
        const c6_dy3 = f(58.4 * sy);

        // c 3.88 33.53 3.88 67.06 0 100.6
        const c7_dx1 = f(3.88 * sx);
        const c7_dy1 = f(33.53 * sy);
        const c7_dx2 = f(3.88 * sx);
        const c7_dy2 = f(67.06 * sy);
        const c7_dx3 = f(0 * sx);
        const c7_dy3 = f(100.6 * sy);

        // c -3.54 30.6 -27.8 54.86 -58.4 58.4
        const c8_dx1 = f(-3.54 * sx);
        const c8_dy1 = f(30.6 * sy);
        const c8_dx2 = f(-27.8 * sx);
        const c8_dy2 = f(54.86 * sy);
        const c8_dx3 = f(-58.4 * sx);
        const c8_dy3 = f(58.4 * sy);

        return `M${m_x},${m_y}` +
            `c${c1_dx1},${c1_dy1},${c1_dx2},${c1_dy2},${c1_dx3},${c1_dy3}` +
            `c${c2_dx1},${c2_dy1},${c2_dx2},${c2_dy2},${c2_dx3},${c2_dy3}` +
            `c${c3_dx1},${c3_dy1},${c3_dx2},${c3_dy2},${c3_dx3},${c3_dy3}` +
            `C${c4_x1},${c4_y1},${c4_x2},${c4_y2},${c4_x3},${c4_y3}` +
            `c${c5_dx1},${c5_dy1},${c5_dx2},${c5_dy2},${c5_dx3},${c5_dy3}` +
            `c${c6_dx1},${c6_dy1},${c6_dx2},${c6_dy2},${c6_dx3},${c6_dy3}` +
            `c${c7_dx1},${c7_dy1},${c7_dx2},${c7_dy2},${c7_dx3},${c7_dy3}` +
            `c${c8_dx1},${c8_dy1},${c8_dx2},${c8_dy2},${c8_dx3},${c8_dy3}Z`;
    }

    function injectSquircle(svgStr, squircleColor) {
        if (!svgStr) return svgStr;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgStr, "image/svg+xml");
            const svgEl = doc.querySelector('svg');
            if (!svgEl) return svgStr;

            // Determine ViewBox / Size
            let vb = svgEl.getAttribute('viewBox');
            let minX = 0, minY = 0, width, height;

            if (vb) {
                const parts = vb.match(/-?[\d\.]+(?:e-?\d+)?/gi)?.map(parseFloat);
                if (parts && parts.length >= 4) {
                    minX = parts[0];
                    minY = parts[1];
                    width = parts[2];
                    height = parts[3];
                }
            }

            if (width === undefined || height === undefined) {
                width = parseFloat(svgEl.getAttribute('width')) || 100;
                height = parseFloat(svgEl.getAttribute('height')) || 100;
                if (!vb) {
                    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
                }
            }

            const squirclePaddingPercent = (parseInt(squirclePaddingSlider.value) || 0) / 100;
            const offset = width * squirclePaddingPercent;
            const squircleW = width * (1 - 2 * squirclePaddingPercent);
            const squircleH = height * (1 - 2 * squirclePaddingPercent);

            // Create squircle path
            const squirclePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
            squirclePath.setAttribute("d", generateSquirclePath(minX + offset, minY + offset, squircleW, squircleH));
            squirclePath.setAttribute("fill", squircleColor);
            squirclePath.setAttribute("class", "svg-squircle-bg");

            // Create group to scale original contents
            const g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
            const cx = minX + width / 2;
            const cy = minY + height / 2;
            const finalScale = 0.75 * (1 - 2 * squirclePaddingPercent);
            g.setAttribute("transform", `translate(${cx}, ${cy}) scale(${finalScale}) translate(${-cx}, ${-cy})`);

            // Move non-metadata children to group
            const children = Array.from(svgEl.childNodes);
            children.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toLowerCase();
                    if (tag !== 'defs' && tag !== 'style' && tag !== 'metadata') {
                        g.appendChild(child);
                    }
                }
            });

            // Append group to SVG
            svgEl.appendChild(g);

            // Prepend squircle path so it is in the background
            svgEl.insertBefore(squirclePath, svgEl.firstChild);

            return new XMLSerializer().serializeToString(doc);
        } catch (e) {
            console.error("Failed to inject squircle to SVG", e);
            return svgStr;
        }
    }

    function applySquircleToStateSvgs() {
        const isSquircleActive = squircleToggle.checked;
        const squircleColor = squircleColorPicker.value;

        if (isSquircleActive && baseLightSvgString) {
            lightSvgString = injectSquircle(baseLightSvgString, squircleColor);
            
            const parsed = parseColorToRgb(squircleColor);
            const darkSquircleColor = createDarkModeColor(parsed.r, parsed.g, parsed.b, parsed.a);
            darkSvgString = injectSquircle(baseDarkSvgString, darkSquircleColor);
        } else {
            lightSvgString = baseLightSvgString;
            darkSvgString = baseDarkSvgString;
        }
    }
});