import React, { useEffect, useState } from "react";
import ForgeReconciler, { Text, Select, Button } from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);

  useEffect(() => {
    invoke("getPages")
      .then(setPages)
      .catch((err) => setError(err));
  }, []);

  const handleSavePages = async () => {
    try {
      await invoke("saveSelectedPages", { pageIds: selectedPages });
    } catch (err) {
      setError(err);
    }
  };

  if (error) {
    return <Text>Error loading pages: {error.message}</Text>;
  }

  if (!pages) {
    return <Text>Loading pages...</Text>;
  }

  return (
    <>
      <Text>Select Confluence Pages:</Text>
      <Select
        options={pages.results?.map((page) => ({
          label: `${page.title} - ${page.spaceId}`,
          value: page.id,
        }))}
        onChange={(value) => setSelectedPages([value])}
        placeholder="Select a page"
      />
      <Button text="Save" onClick={handleSavePages} />
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
