const container = document.querySelector(".magnifier-container");
const image = document.getElementById("magnify-image");

const SCALE = 3; // change to 4 if you want more zoom

container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const xPercent = x / rect.width;
  const yPercent = y / rect.height;

  const translateX = -xPercent * (image.offsetWidth * SCALE - rect.width);
  const translateY = -yPercent * (image.offsetHeight * SCALE - rect.height);

  image.style.transform = `
    scale(${SCALE})
    translate(${translateX / SCALE}px, ${translateY / SCALE}px)
  `;
});

container.addEventListener("mouseenter", () => {
  image.style.transition = "transform 0.05s ease-out";
});

container.addEventListener("mouseleave", () => {
  image.style.transform = "scale(1) translate(0, 0)";
  image.style.transition = "transform 0.2s ease-out";
});
