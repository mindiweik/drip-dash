import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="max-w-5xl w-full p-8 text-center mx-auto">
      <div className="flex items-center justify-center gap-4">
        <a href="https://vite.dev" target="_blank">
          <img
            src={viteLogo}
            className="h-24 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
            alt="Vite logo"
          />
        </a>
        <a href="https://react.dev" target="_blank">
          <img
            src={reactLogo}
            className="h-24 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#61dafbaa] motion-safe:animate-spin motion-safe:[animation-duration:20s]"
            alt="React logo"
          />
        </a>
      </div>
      <h1 className="text-4xl font-bold my-8">Vite + React</h1>
      <div className="p-8">
        <button
          onClick={() => setCount((count) => count + 1)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          count is {count}
        </button>
        <p className="mt-4">
          Edit <code className="bg-gray-100 px-2 py-1 rounded text-sm">src/App.tsx</code> and save
          to test HMR
        </p>
      </div>
      <p className="text-gray-500 mt-4">Click on the Vite and React logos to learn more</p>
    </div>
  );
}

export default App;
