/* The Kneading Room · page 1 · game.js
   Plain JavaScript: pop-up → flip the sign to OPEN → narration.
   (The first customer walking in comes on the next page.) */

const overlay = document.getElementById('overlay');
const flipBtn = document.getElementById('flip-btn');
const narration = document.getElementById('narration');
const statusEl = document.getElementById('status');

let announced = false;

// Move keyboard focus into the pop-up so Enter / Space works straight away.
flipBtn.focus();

flipBtn.addEventListener('click', () => {
  overlay.hidden = true;
  if (window.flipSign) window.flipSign();     // sketch.js animates the sign
  // Safety net: if the animation event never arrives, still show the narration.
  setTimeout(showOpen, 3000);
});

// sketch.js fires this when the sign has finished turning to OPEN.
window.addEventListener('sign-opened', showOpen);

function showOpen() {
  if (announced) return;
  announced = true;
  narration.hidden = false;
  statusEl.textContent = 'The sign on the door now reads OPEN.';
}
