import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiteApp } from './LiteApp';
import '../styles/tokens.css';
import './lite.css';

const root = document.getElementById('lite-root');
if (root) createRoot(root).render(<StrictMode><LiteApp /></StrictMode>);
