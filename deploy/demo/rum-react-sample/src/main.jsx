import * as FuseScope from '@fusescope/browser';
import { ErrorBoundary } from '@fusescope/browser-react';
import { reactRouterRouteTemplate } from '@fusescope/browser-react/react-router';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Outlet, useLocation, useParams, useRoutes } from 'react-router';

const products = [
  { id: '1', name: 'Trail runner', price: 89 },
  { id: '2', name: 'City sneaker', price: 64 },
  { id: '3', name: 'Rain boot', price: 52 },
];
const customers = [123, 392, 731, 567];

function Home() {
  return (
    <>
      <h1>Shop</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <Link to={`/products/${p.id}`} data-product={p.id}>
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Coupon() {
  const [applied, setApplied] = useState(false);
  if (applied) {
    const coupon = undefined;
    return <p>{coupon.discount}% off</p>;
  }
  return (
    <button id="coupon" type="button" onClick={() => setApplied(true)}>
      Apply coupon
    </button>
  );
}

function Product() {
  const { id } = useParams();
  const product = products.find((p) => p.id === id);
  if (!product) return <h1>Unknown product</h1>;
  return (
    <>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      <Coupon />
    </>
  );
}

function Cart() {
  const [status, setStatus] = useState('');
  const order = async () => {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const r = await fetch(`/api/dispatch?customer=${customer}&nonse=${Math.random()}`);
    setStatus(`order ${r.status}`);
  };
  return (
    <>
      <h1>Cart</h1>
      <button id="order" type="button" onClick={order}>
        Place order
      </button>
      <pre id="out">{status}</pre>
    </>
  );
}

function Account() {
  return (
    <>
      <h1>Account</h1>
      <Link to="/account/orders/1001">Order 1001</Link> <Link to="/account/orders/1002">Order 1002</Link>
      <Outlet />
    </>
  );
}

function Order() {
  const { orderId } = useParams();
  return <h2>Order {orderId}</h2>;
}

const routes = [
  {
    path: '/',
    element: <Outlet />,
    children: [
      { index: true, element: <Home /> },
      { path: 'products/:id', element: <Product /> },
      { path: 'cart', element: <Cart /> },
      {
        path: 'account',
        element: <Account />,
        children: [
          { index: true, element: <p>Pick an order.</p> },
          { path: 'orders/:orderId', element: <Order /> },
        ],
      },
      { path: '*', element: <h1>Not found</h1> },
    ],
  },
];

FuseScope.init({
  ...window.FUSESCOPE_CONFIG,
  service: 'shop-react',
  environment: 'demo',
  version: '1.0.0',
  routeTemplate: reactRouterRouteTemplate(routes),
});

function Pages() {
  return useRoutes(routes);
}

function Fallback({ error, reset }) {
  return (
    <div role="alert">
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button id="reset" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}

function App() {
  const location = useLocation();
  return (
    <>
      <nav>
        <Link to="/">Home</Link> <Link to="/cart">Cart</Link> <Link to="/account">Account</Link>{' '}
        <Link to="/promotions/black-friday">Promotions</Link>
      </nav>
      <main>
        <ErrorBoundary resetKeys={[location.pathname]} fallback={Fallback}>
          <Pages />
        </ErrorBoundary>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
