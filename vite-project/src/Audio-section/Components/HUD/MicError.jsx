export default function MicError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="max-w-xs rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
  );
}