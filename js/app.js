
document.addEventListener("DOMContentLoaded", () => {

    // Automatically update the copyright year.
    const currentYear = document.getElementById("currentYear");

    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }


    // Mobile navigation.
    const menuButton = document.getElementById("mobileMenuButton");
    const mainNav = document.getElementById("mainNav");

    if (menuButton && mainNav) {

        menuButton.addEventListener("click", () => {

            const isOpen = mainNav.classList.toggle("open");

            menuButton.setAttribute("aria-expanded", String(isOpen));

            menuButton.innerHTML = isOpen
                ? '<i class="fa-solid fa-xmark"></i>'
                : '<i class="fa-solid fa-bars"></i>';
        });


        // Close the menu after clicking a navigation link.
        mainNav.querySelectorAll("a").forEach(link => {

            link.addEventListener("click", () => {

                mainNav.classList.remove("open");

                menuButton.setAttribute("aria-expanded", "false");

                menuButton.innerHTML =
                    '<i class="fa-solid fa-bars"></i>';
            });

        });

    }

});
