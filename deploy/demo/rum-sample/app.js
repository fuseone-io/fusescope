const out = document.getElementById('out');
const customers = [123, 392, 731, 567];

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', a.getAttribute('href'));
  document.getElementById('title').textContent = location.pathname;
});

document.getElementById('order').onclick = async () => {
  const customer = customers[Math.floor(Math.random() * customers.length)];
  const r = await fetch(`/api/dispatch?customer=${customer}&nonse=${Math.random()}`);
  out.textContent = `order ${r.status}\n`;
};
document.getElementById('fail').onclick = () => {
  throw new TypeError("Cannot read properties of undefined (reading 'total')");
};
document.getElementById('reject').onclick = () => {
  Promise.reject(new Error('payment API rejected the card'));
};
