import { AuthProvider } from './context';
import Navbar from './components/Navbar';
import Hello from './pages/hello';

function App() {
  return (
    <AuthProvider>
      <Navbar />
      <main>
        <Hello />
      </main>
    </AuthProvider>
  );
}

export default App;