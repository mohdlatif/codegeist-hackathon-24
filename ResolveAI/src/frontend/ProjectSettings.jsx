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
  xcss,
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
  const [verificationStatus, setVerificationStatus] = useState(null);

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
      .then((storedUserId) => {
        console.log("Loaded stored user ID:", storedUserId);
        if (storedUserId) {
          setSelectedUser(storedUserId);
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

  const handleUserChange = async (user) => {
    console.log("Selected user:", user);
    setSelectedUser(user.id);
    setIsLoading(true);
    try {
      await invoke("saveSelectedUser", { user });
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

  const handleVerifyToken = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("verifyCloudflareToken", {
        apiKey: cloudflareCredentials.apiKey,
      });

      console.log("Verification response:", response);

      if (
        response &&
        response.success === true &&
        response.result &&
        response.result.status === "active"
      ) {
        setVerificationStatus("valid");
      } else {
        setVerificationStatus("invalid");
      }
    } catch (error) {
      console.error("Verification error:", error);
      setVerificationStatus("invalid");
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
        <Stack space="space.100">
          <Text>Select user as default assignee for tickets:</Text>
          <Box
            xcss={xcss({
              maxWidth: "400px",
            })}
          >
            <UserPicker
              label="Default Assignee"
              placeholder="Select user"
              name="default-assignee"
              defaultValue={selectedUser}
              onChange={handleUserChange}
              isRequired={true}
              description="This user will be set as the default assignee for tickets"
            />
          </Box>
        </Stack>

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
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <Text>Enter your Cloudflare credentials:</Text>
            <Inline
              space="space.200"
              alignBlock="stretch"
              spread="space-between"
              alignInline="center"
            >
              <Textfield
                label="Account ID"
                aria-labelledby="account-id"
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
            </Inline>
            <Inline space="space.200">
              <Box xcss={xcss({ maxWidth: "250px" })}>
                <LoadingButton
                  appearance="primary"
                  isLoading={isLoading}
                  onClick={handleSaveCloudflareCredentials}
                >
                  Save Cloudflare Settings
                </LoadingButton>
              </Box>
              <LoadingButton
                appearance="default"
                isLoading={isLoading}
                onClick={handleVerifyToken}
              >
                Verify Token
              </LoadingButton>
              {verificationStatus && (
                <Text
                  color={
                    verificationStatus === "valid"
                      ? "color.text.success"
                      : "color.text.danger"
                  }
                >
                  {verificationStatus === "valid"
                    ? "✓ Token is valid and active"
                    : "✗ Invalid token"}
                </Text>
              )}
            </Inline>
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
