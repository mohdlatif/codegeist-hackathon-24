import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text, Button } from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [savedPages, setSavedPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke("getSavedPages")
      .then(setSavedPages)
      .catch((err) => setError(err));
  }, []);

  const handleExampleRequest = async () => {
    try {
      const response = await invoke("makeExampleRequest");
      console.log("Button clicked, response received:", response);
    } catch (err) {
      console.error("Error making example request:", err);
      setError(err);
    }
  };

  if (error) {
    return <Text>Error loading saved pages: {error.message}</Text>;
  }

  if (!savedPages) {
    return <Text>Loading saved pages...</Text>;
  }

  return (
    <>
      <Button text="Make Example Request" onClick={handleExampleRequest} />
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
