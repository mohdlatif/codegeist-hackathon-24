import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text, Select } from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke("getPages")
      .then(setPages)
      .catch((err) => setError(err));
  }, []);

  if (error) {
    return <Text>Error loading pages: {error.message}</Text>;
  }

  if (!pages) {
    return <Text>Loading pages...</Text>;
  }

  return (
    <>
      <Text>Confluence Pages:</Text>
      {pages.results?.map((page) => (
        <Text key={page.id}>
          {page.title} - {page.spaceId}
        </Text>
      ))}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
