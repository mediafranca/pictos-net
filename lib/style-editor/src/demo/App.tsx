import React from 'react';
import { StyleEditor } from '../../lib';

/**
 * Demo application showing the StyleEditor component in action.
 * This is a simple example of how to integrate StyleEditor into your app.
 */
const App: React.FC = () => {
  return (
    <StyleEditor
      onStylesChange={(styles) => {
        console.log('Styles updated:', styles);
      }}
      onSave={(style) => {
        console.log('Style saved:', style);
      }}
      onDelete={(id) => {
        console.log('Style deleted:', id);
      }}
      onExport={(css) => {
        console.log('CSS exported:', css);
      }}
    />
  );
};

export default App;
