const fail = async () => {
  const err = new Error('provider_not_implemented');
  err.status = 503;
  throw err;
};

export const configured = () => false;

export const configInfo = () => ({
  provider: 'guardarian',
  configured: false,
  surchargePct: 0
});

export const createOrder = fail;
export const getStatus = fail;
export const getStatusFromWebhook = async () => null;