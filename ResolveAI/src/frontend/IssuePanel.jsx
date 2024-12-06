import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Text,
  Select,
  Button,
  CheckboxGroup,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [savedPages, setSavedPages] = useState(null);

  useEffect(() => {
    invoke("getPages")
      .then(setPages)
      .catch((err) => setError(err));

    // Load saved pages on mount
    invoke("getSavedPages")
      .then(setSavedPages)
      .catch((err) => console.error("Error loading saved pages:", err));
  }, []);

  const handleSavePages = async () => {
    try {
      await invoke("saveSelectedPages", { pageIds: selectedPages });
      // Refresh saved pages
      const updated = await invoke("getSavedPages");
      setSavedPages(updated);
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
      <Button text="Save Selected Pages" onClick={handleSavePages} />

      {savedPages && (
        <>
          <Text>Saved Pages:</Text>
          {savedPages.map((page) => (
            <Text key={page.id}>{page.title}</Text>
          ))}
        </>
      )}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
