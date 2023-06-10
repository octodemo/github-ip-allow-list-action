// Importing required modules
const core = require('@actions/core')
  , enterprise = require('./src/enterprise')
  , githubClient = require('./src/github')
  ;

// Function to get the required input value
function getRequiredInputValue(key) {
  return core.getInput(key, { required: true });
}

// Main function
async function run() {
  try {
    // Getting the required input values
    const githubToken = getRequiredInputValue('github_token')
      , metadataSection = core.getInput('metadata_section')
      , customCidrs = core.getInput('custom_cidrs')
      , enterpriseSlug = getRequiredInputValue('enterprise_slug')
      , isActive = core.getInput('active') === 'true'
      ;

    // Creating an instance of the GitHub client
    const octokit = githubClient.create(githubToken);

    // Getting the target enterprise
    const targetEnterprise = await enterprise.getEnterprise(enterpriseSlug, octokit);
    core.info(`Enterprise account: ${targetEnterprise.name} : ${targetEnterprise.url}`);

    // Validating input values
    if (!metadataSection && !customCidrs) {
      throw new Error('A set of custom CIDRS or GitHub meta CIDRs section must be specified.');
    }

    // Adding GitHub meta CIDRs to the enterprise
    if (metadataSection) {
      const cidrs = await getMetaCIDRs(octokit, metadataSection);
      if (cidrs) {
        core.info(`GitHub meta CIDRs to add: ${JSON.stringify(cidrs)}`);
        await addCidrsToEnterprise(targetEnterprise, cidrs, isActive, `GitHub Meta CIDR for ${metadataSection}`);
      } else {
        throw new Error(`The metadata CIDRs for '${metadataSection}' were unable to be resolved.`);
      }
    }

    // Adding custom CIDRs to the enterprise
    if (customCidrs) {
      const cidrs = getCidrs(customCidrs);
      core.info(`Custom CIDRs to add: ${JSON.stringify(cidrs)}`);
      await addCidrsToEnterprise(targetEnterprise, cidrs, isActive, core.getInput('custom_cidrs_label'));
    }
  } catch (err) {
    core.setFailed(err);
  }
}

// Calling the main function
run();

// Function to add CIDRs to the enterprise
async function addCidrsToEnterprise(targetEnterprise, cidrs, isActive, name) {
  for (const cidr of cidrs) {
    const existingEntry = await getIpAllowListEntry(targetEnterprise, cidr);
    if (existingEntry && !existingEntry.isActive) {
      await updateIpAllowListEntry(targetEnterprise, existingEntry.id, isActive);
      core.info(`Enabled existing IP allow list entry for ${cidr}`);
    } else if (!existingEntry) {
      const newEntry = await targetEnterprise.addAllowListCIDRs(name, [cidr], isActive);
      core.info(`Added new IP allow list entry for ${cidr}`);
    }
  }
}

// Function to get the GitHub meta CIDRs
async function getMetaCIDRs(octokit, name) {
  const results = await octokit.rest.meta.get();
  core.info(`Loaded GitHub Meta API CIDRs`);

  return results.data[name];
}

// Function to get the CIDRs from the input value
function getCidrs(value) {
  const cidrs = value.split(',');

  const result = [];
  cidrs.forEach(cidr => {
    const cleanCidr = cidr.trim();
    if (cleanCidr.length > 0) {
      result.push(cidr.trim());
    }
  });

  return result;
}
