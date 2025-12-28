import { useState } from 'react';
import CoreButton from './components/coreButton';

function App() {
  const [count, setCount] = useState(0);
  const [systemName, setSystemName] = useState('Mystical Menagerie');

  return (
    <div>
      <h1 className="text-2xl font-bold">Drip Dashboard</h1>
      <h2 className="text-lg">{systemName}</h2>
      <CoreButton onClick={() => setCount((count) => count + 1)} text={count} />
      <CoreButton onClick={() => setSystemName('New System')} text={systemName} />
    </div>
  );
}

export default App;
