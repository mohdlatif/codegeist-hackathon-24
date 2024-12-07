import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text } from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [savedPages, setSavedPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke("getSavedPages")
      .then(setSavedPages)
      .catch((err) => setError(err));
  }, []);

  if (error) {
    return <Text>Error loading saved pages: {error.message}</Text>;
  }

  if (!savedPages) {
    return <Text>Loading saved pages...</Text>;
  }

  return (
    <>
      <Text>Saved Confluence Pages:</Text>
      {savedPages.map((page) => (
        <Text key={page.id}>{page.title}</Text>
      ))}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
