import './legacy.css';

// Renders a pre-rebuild view with its original styles, isolated under .legacy-scope.
export default function LegacyScope({ children }) {
  return <div className="legacy-scope min-h-full">{children}</div>;
}
