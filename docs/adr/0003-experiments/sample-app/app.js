const out = document.getElementById('out');
const log = (v) => (out.textContent += JSON.stringify(v) + '\n');

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', a.getAttribute('href'));
  document.getElementById('title').textContent = location.pathname;
});

document.getElementById('dispatch').onclick = async () => {
  const r = await fetch(`/api/dispatch?customer=392&nonse=${Math.random()}`);
  log({ fetch: r.status });
};
document.getElementById('dispatch-xhr').onclick = () => {
  const x = new XMLHttpRequest();
  x.open('GET', `/api/dispatch?customer=123&nonse=${Math.random()}`);
  x.onload = () => log({ xhr: x.status });
  x.send();
};
document.getElementById('cors').onclick = async () => {
  for (const p of ['echo', 'deny']) log(await (await fetch(`http://127.0.0.1:3350/${p}`)).json());
};
document.getElementById('throw').onclick = () => {
  throw new TypeError('spike: cannot read properties of undefined');
};
document.getElementById('reject').onclick = () => {
  Promise.reject(new Error('spike: payment API rejected'));
};
