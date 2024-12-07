import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Heading,
  Box,
  Select,
  Inline,
  Text,
  Stack,
  Image,
  Textfield,
  UserPicker,
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
  const [cloudflareCredentials, setCloudflareCredentials] = useState({
    accountId: "",
    email: "",
    apiKey: "",
  });

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

    invoke("getSelectedUser")
      .then((storedUser) => {
        if (storedUser) {
          setSelectedUser(storedUser);
        }
      })
      .catch((err) => setError(err));

    invoke("getCloudflareCredentials")
      .then((credentials) => {
        if (credentials) {
          setCloudflareCredentials(credentials);
        }
      })
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

  const handleUserChange = async (value) => {
    setSelectedUser(value);
    setIsLoading(true);
    try {
      await invoke("saveSelectedUser", { userId: value });
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCloudflareCredentials = async () => {
    setIsLoading(true);
    try {
      await invoke("saveCloudflareCredentials", {
        accountId: cloudflareCredentials.accountId,
        email: cloudflareCredentials.email,
        apiKey: cloudflareCredentials.apiKey,
      });
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
    <Stack space="space.400">
      <Stack space="space.075">
        <Box
          backgroundColor="color.background.brand.boldest"
          padding="space.100"
        >
          <Heading as="h4">Project Settings</Heading>
        </Box>
        <Text>Select user as default assignee for tickets:</Text>
        <Inline space="space.200" shouldWrap>
          <Select
            options={users.map((user) => ({
              label: user.displayName,
              value: user.accountId,
            }))}
            value={selectedUser}
            onChange={handleUserChange}
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
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Cloudflare Settings</Heading>
        </Box>
        <Stack space="space.100">
          <Text>Enter your Cloudflare credentials:</Text>
          <Inline
            space="space.200"
            alignBlock="center"
            spread="space-between"
            alignInline="center"
          >
            <Textfield
              label="Account ID"
              isCompact={true}
              value={cloudflareCredentials.accountId || ""}
              onChange={(e) =>
                setCloudflareCredentials((prev) => ({
                  ...prev,
                  accountId: e.target.value,
                }))
              }
              placeholder="Enter Account ID"
              spacing="compact"
            />
            <Textfield
              label="Email"
              isCompact
              value={cloudflareCredentials.email || ""}
              onChange={(e) =>
                setCloudflareCredentials((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
              placeholder="Enter Cloudflare Email"
              spacing="compact"
            />
            <Textfield
              label="API Key"
              isCompact
              value={cloudflareCredentials.apiKey || ""}
              onChange={(e) =>
                setCloudflareCredentials((prev) => ({
                  ...prev,
                  apiKey: e.target.value,
                }))
              }
              placeholder="Enter API Key"
              spacing="compact"
            />
            <LoadingButton
              appearance="primary"
              isLoading={isLoading}
              onClick={handleSaveCloudflareCredentials}
            >
              Save Cloudflare Settings
            </LoadingButton>
          </Inline>
        </Stack>
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
