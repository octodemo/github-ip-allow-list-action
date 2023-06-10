const core = require('@actions/core')
  , enterprise = require('./src/enterprise')
  , githubClient = require('./src/github')
  ;

function getRequiredInputValue(key) {
  return core.getInput(key, { required: true });
}

async function run() {
  try {
    const githubToken = getRequiredInputValue('github_token')
      , metadataSection = core.getInput('metadata_section')
      , customCidrs = core.getInput('custom_cidrs')
      , enterpriseSlug = getRequiredInputValue('enterprise_slug')
      , isActive = core.getInput('active') === 'true'
      ;

    const octokit = githubClient.create(githubToken);
    const targetEnterprise = await enterprise.getEnterprise(enterpriseSlug, octokit);
    core.info(`Enterprise account: ${targetEnterprise.name} : ${targetEnterprise.url}`);

    if (!metadataSection && !customCidrs) {
      throw new Error('A set of custom CIDRS or GitHub meta CIDRs section must be specified.');
    }

    if (metadataSection) {
      const cidrs = await getMetaCIDRs(octokit, metadataSection);
      if (cidrs) {
        core.info(`GitHub meta CIDRs to add: ${JSON.stringify(cidrs)}`);
        await addCidrsToEnterprise(targetEnterprise, cidrs, isActive, `GitHub Meta CIDR for ${metadataSection}`);
        // Retrieve the IP allow list entries for the metadata section and log their isActive property
        const metadataIpAllowListEntries = await targetEnterprise.getEnterpriseIpAllowListEntries({ metadata: metadataSection });
        for (const entry of metadataIpAllowListEntries) {
          console.log(`IP allow list entry ${entry.name} for metadata section ${metadataSection} is active: ${entry.isActive}`);
        }
      } else {
        throw new Error(`The metadata CIDRs for '${metadataSection}' were unable to be resolved.`);
      }
    }

    if (customCidrs) {
      const cidrs = getCidrs(customCidrs);
      core.info(`Custom CIDRs to add: ${JSON.stringify(cidrs)}`);
      await addCidrsToEnterprise(targetEnterprise, cidrs, isActive, core.getInput('custom_cidrs_label'));
  
      const ipAllowListEntries = await targetEnterprise.getEnterpriseIpAllowListEntries();
      // Loop through the IP allow list entries and log their isActive property
      for (const entry of ipAllowListEntries) {
        console.log(`IP allow list entry ${entry.name} is active: ${entry.isActive}`);
      }
    }
  } catch (err) {
    core.setFailed(err);
  }
}

run();

async function addCidrsToEnterprise(enterprise, cidrs, isActive, label) {
  const ipAllowListEntries = await enterprise.getEnterpriseIpAllowListEntries();
  for (const entry of ipAllowListEntries) {
    if (entry.name === label) {
      core.startGroup(`Updating IP Allow List Entry: ${label}`);
      await entry.update({ cidrs, isActive });
      core.endGroup();
      return;
    }
  }

  core.startGroup(`Building IP Allow List Entry: ${label}`);
  await enterprise.addAllowListCIDRs(label, cidrs, isActive);
  core.endGroup();
}

async function getMetaCIDRs(octokit, name) {
  const results = await octokit.rest.meta.get();
  core.info(`Loaded GitHub Meta API CIDRs`);

  return results.data[name];
}

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
