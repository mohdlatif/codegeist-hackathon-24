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
  List,
  Strong,
  ListItem,
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
  const [maskCredentials, setMaskCredentials] = useState(true);
  const [messageType, setMessageType] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    invoke("getPages")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else {
          setPages(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getSelectedPages")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response && response.length > 0) {
          setSelectedPages(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getUsers")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else {
          setUsers(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getSelectedUser")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response) {
          setSelectedUser(response);
        }
      })
      .catch((err) => setError(err.message));

    invoke("getCloudflareCredentials")
      .then((response) => {
        if (response.error) {
          setError(response.error);
        } else if (response) {
          setCloudflareCredentials(response);
          setCloudflareCredentials((prev) => ({
            accountId: response.accountId
              ? "••••" + response.accountId.slice(-4)
              : "",
            email: response.email
              ? response.email.replace(/(.{2})(.*)(@.*)/, "$1•••$3")
              : "",
            apiKey: response.apiKey ? "••••" + response.apiKey.slice(-4) : "",
          }));
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const handleSavePages = async () => {
    setIsLoading(true);
    try {
      const response = await invoke("saveSelectedPages", {
        pageIds: selectedPages,
      });
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserChange = async (user) => {
    setSelectedUser(user.id);
    setIsLoading(true);
    try {
      const response = await invoke("saveSelectedUser", { user });
      if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
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
      // Get actual credentials from storage first
      const storedCredentials = await invoke("getCloudflareCredentials");

      const response = await invoke("verifyCloudflareToken", {
        apiKey: storedCredentials.apiKey, // Use the stored API key instead of the masked one
      });

      // console.log("Verification response:", response);

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

  const handleFetchPagesContent = async () => {
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const vectorizeResult = await invoke("vectorizePages");
      console.log("Vectorization result:", vectorizeResult);

      if (vectorizeResult.success) {
        setVerificationStatus("vectorized");
        const message = vectorizeResult.message;
        setSuccessMessage(message);
      } else {
        setVerificationStatus("failed");
        setErrorMessage(vectorizeResult.message);
      }
    } catch (err) {
      console.error(err);
      setVerificationStatus("failed");
      setErrorMessage("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialBlur = (field) => {
    const currentValue = cloudflareCredentials[field];

    // Only mask if the value isn't already masked
    if (!currentValue.includes("•")) {
      setCloudflareCredentials((prev) => ({
        ...prev,
        [field]:
          field === "email"
            ? currentValue.replace(/(.{2})(.*)(@.*)/, "$1•••$3")
            : "••••" + currentValue.slice(-4),
      }));
    }
  };

  if (error) {
    return (
      <Stack space="space.400">
        <Box backgroundColor="color.background.danger" padding="space.200">
          <Text color="color.text.danger">Error: {error}</Text>
        </Box>
        <App /> {/* Optionally render the rest of the app below the error */}
      </Stack>
    );
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
                onBlur={() => handleCredentialBlur("accountId")}
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
                onBlur={() => handleCredentialBlur("email")}
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
                onBlur={() => handleCredentialBlur("apiKey")}
                placeholder="Enter API Key"
                spacing="compact"
              />
            </Inline>
            <Inline space="space.200" shouldWrap>
              <LoadingButton
                appearance="primary"
                isLoading={isLoading}
                onClick={handleSaveCloudflareCredentials}
              >
                Save Cloudflare Settings
              </LoadingButton>

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
                    : verificationStatus === "invalid"
                    ? "✗ Token verification failed"
                    : null}
                </Text>
              )}
            </Inline>
          </Stack>
        </Box>
      </Stack>
      <Stack space="space.075">
        <Box backgroundColor="color.background.neutral" padding="space.100">
          <Heading as="h4">Vector Database Management</Heading>
        </Box>
        <Box xcss={xcss({ maxWidth: "600px" })}>
          <Stack space="space.100">
            <Text>
              <Strong>
                Sync selected pages with the vector database. This process will:
              </Strong>
            </Text>
            <List type="unordered">
              <ListItem>
                Index new pages that haven't been vectorized before
              </ListItem>
              <ListItem>
                Update content for pages that have been modified
              </ListItem>
              <ListItem>Skip unchanged pages to optimize processing</ListItem>
              <ListItem>
                Track changes using content hashing for efficiency
              </ListItem>
            </List>
            <Stack space="space.100">
              <LoadingButton
                appearance="primary"
                isLoading={isLoading}
                onClick={handleFetchPagesContent}
              >
                Sync Pages to Vector DB
              </LoadingButton>

              {/* Success Message */}
              {successMessage && (
                <Box
                  backgroundColor="color.background.success.subtle"
                  padding="space.150"
                >
                  <Text color="color.text.success">✓ {successMessage}</Text>
                </Box>
              )}

              {/* Error Message */}
              {errorMessage && (
                <Box
                  backgroundColor="color.background.danger.subtle"
                  padding="space.150"
                >
                  <Text color="color.text.danger">✗ {errorMessage}</Text>
                </Box>
              )}
            </Stack>
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
