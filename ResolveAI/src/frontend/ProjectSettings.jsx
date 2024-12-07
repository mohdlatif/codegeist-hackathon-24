import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Heading,
  Box,
  Select,
  Inline,
  Text,
  Stack,
  Image,
  LoadingButton,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const App = () => {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    invoke("getPages")
      .then(setPages)
      .catch((err) => setError(err));

    invoke("getSelectedPages")
      .then((storedPages) => {
        if (storedPages && storedPages.length > 0) {
          setSelectedPages(storedPages);
        }
      })
      .catch((err) => setError(err));

    invoke("getUsers")
      .then(setUsers)
      .catch((err) => setError(err));
  }, []);

  const handleSavePages = async () => {
    setIsLoading(true);
    try {
      await invoke("saveSelectedPages", { pageIds: selectedPages });
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return <Text>Error loading data: {error.message}</Text>;
  }

  if (!pages || !users) {
    return <Text>Loading data...</Text>;
  }

  return (
    <Stack space="space.075">
      <Box backgroundColor="color.background.brand.boldest" padding="space.100">
        <Heading as="h4">Project Settings</Heading>
      </Box>
      <Text>Select user as default assignee for tickets:</Text>
      <Inline space="space.200" shouldWrap>
        <Select
          options={users.map((user) => ({
            label: user.displayName,
            value: user.accountId,
            userData: {
              emailAddress: user.emailAddress,
            },
          }))}
          value={selectedUser}
          onChange={(value) => setSelectedUser(value)}
          placeholder="Select user"
          isSearchable={true}
          isRequired={true}
          spacing="compact"
        />
      </Inline>
      <Text>Select source pages for AI to generate answers from:</Text>
      <Inline space="space.200" shouldWrap>
        <Select
          options={pages.results?.map((page) => ({
            label: `${page.title}`,
            value: page.id,
          }))}
          value={pages?.results
            ?.filter((page) => selectedPages.includes(page.id))
            .map((page) => ({
              label: `${page.title}`,
              value: page.id,
            }))}
          onChange={(values) => setSelectedPages(values.map((v) => v.value))}
          placeholder="Select pages"
          isMulti
          isSearchable={true}
          spacing="compact"
        />
        <LoadingButton
          appearance="primary"
          isLoading={isLoading}
          onClick={handleSavePages}
        >
          Save Selected Pages
        </LoadingButton>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
