// @flow

import type { PoolRegistrationType, PoolRetirementType, StakeDelegationType } from './certificate'
import { CERT_TYPE } from './certificate'
import type { ShelleyTxType } from './tx'
import { AddressKind } from '../../../js-chain-libs/pkg/js_chain_libs';

function keysToStrings(keys, stringEncoding = 'hex'): Array<string> {
  const result: Array<string> = []
  for (let i = 0; i < keys.size(); i += 1) {
    const keyBytes = Buffer.from(keys.get(i).as_bytes())
    result.push(keyBytes.toString(stringEncoding))
  }
  return result
}

function accountToOptionalAddress(account, discrimination, stringEncoding = 'hex'): string {
  if (!account) {
    return null
  }
  const addressBytes = account.to_address(discrimination).as_bytes()
  return Buffer.from(addressBytes).toString(stringEncoding)
}

function free(...args) {
  for (const a of args) {
    if (a && a.free) {
      a.free()
    }
  }
}

const fragmentToObj = (fragment: any, networkDiscrimination: number, extraData: {txTime: Date}): ShelleyTxType => {
  const wasm = global.jschainlibs

  const common = {
    id: Buffer.from(fragment.id().as_bytes()).toString('hex'),
    txBody: Buffer.from(fragment.as_bytes()).toString('hex'),
    blockNum: undefined,
    blockHash: undefined,
    status: undefined,
    txOrdinal: undefined,
    isGenesis: undefined,
    certificate: undefined,
  }
  if (fragment.is_initial()) {
    console.log('\n\n\n\nINITIAL\n\n\n\n')
  }
  if (fragment.is_owner_stake_delegation()) {
    console.log('\n\n\nOWNER STAKE DELEGATION\n\n\n\n')
  }
  if (fragment.is_stake_delegation()) {
    console.log('\n\n\n\nSTAKE DELEGATION\n\n\n\n')
  }
  if (fragment.is_pool_registration()) {
    console.log('\n\n\n\nPOOL REGISTRATION\n\n\n\n')
  }
  if (fragment.is_pool_retirement()) {
    console.log('\n\n\n\nPOOL MANAGEMENT\n\n\n\n')
  }
  if (fragment.is_old_utxo_declaration()) {
    console.log('\n\n\n\nOLD UTXO\n\n\n\n')
  }
  if (fragment.is_update_proposal()) {
    console.log('\n\n\n\nUPDATE PROPOSAL\n\n\n\n')
  }
  if (fragment.is_update_vote()) {
    console.log('\n\n\n\nUPDATE VOTE\n\n\n\n')
  }
  const tx = fragment.get_transaction()
  const inputs = tx.inputs()
  const inputs_parsed = []
  for (let input_index = 0; input_index < inputs.size(); input_index += 1) {
    const input = inputs.get(input_index)
    console.log(`tx input type: ${input.get_type()}`)
    if (input.is_utxo()) {
      const utxo = input.get_utxo_pointer()
      inputs_parsed.push({
        type: 'utxo',
        txId: Buffer.from(utxo.fragment_id().as_bytes()).toString('hex'),
        idx: utxo.output_index(),
      })
    } else {
      const account = input.get_account_identifier()
      const addr = account.to_account_single().to_address(networkDiscrimination)
      const accountAddrHex = Buffer.from(addr.as_bytes()).toString('hex')
      // TODO: Values are returned as strings under the rationale that js strings
      // can only fit a 52-bit radix as integers, but since the max ADA supply is smaller
      // than this (but bigger than a 32-bit int) this should be safe. We should try and
      // see if this can be changed in js-chain-libs and use that there instead.
      inputs_parsed.push({
        type: 'account',
        account_id: accountAddrHex,
        value: parseInt(input.value().to_str(), 10),
      })
    }
  }
  const outputs = tx.outputs()
  const outputs_parsed = []
  for (let output_index = 0; output_index < outputs.size(); output_index += 1) {
    const output = outputs.get(output_index)
    let outputType = 'utxo'
    switch (output.address().get_kind()) {
      case wasm.AddressKind.Account:
      case wasm.AddressKind.Multisig:
        // should multisig be just account, or will we need more info later?
        outputType = 'account'
        break
      case wasm.AddressKind.Single:
      case wasm.AddressKind.Group:
        outputType = 'utxo'
        break
      default:
        break
    }
    outputs_parsed.push({
      type: outputType,
      address: Buffer.from(output.address().as_bytes()).toString('hex'),
      // See comment for input values
      value: parseInt(output.value().to_str(), 10),
    })
  }
  const cert = tx.certificate !== undefined ? tx.certificate() : null
  if (cert) {
    const payload = Buffer.from(cert.as_bytes()).toString('hex')
    switch (cert.get_type()) {
      case wasm.CertificateKind.PoolRegistration: {
        const reg = cert.get_pool_registration()
        const reg_owners = reg.owners();
        const reg_operators = reg.operators();
        const rewardAccount = reg.reward_account();
        const rewards = reg.rewards()
        const keys = reg.keys()
        const parsedCert: PoolRegistrationType = {
          payload: {
            payloadKind: 'PoolRegistration',
            payloadKindId: wasm.CertificateKind.PoolRegistration,
            payloadHex: payload,
          },
          type: CERT_TYPE.PoolRegistration,
          pool_id: reg.id().to_string(),
          // we should be able to do this considering js max int would be 285,616,414 years
          start_validity: parseInt(reg.start_validity().to_string(), 10),
          owners: keysToStrings(reg_owners),
          operators: keysToStrings(reg_operators),
          rewardAccount: accountToOptionalAddress(rewardAccount, networkDiscrimination),
          // rewards: JSON.stringify(rewards),
          // keys: JSON.stringify(keys),
        }
        common.certificate = parsedCert
        free(reg_owners, reg_operators, rewards, rewardAccount, keys)
        break
      }
      case wasm.CertificateKind.StakeDelegation: {
        const deleg = cert.get_stake_delegation()
        const poolId = deleg.delegation_type().get_full()
        const parsedCert: StakeDelegationType = {
          payload: {
            payloadKind: 'StakeDelegation',
            payloadKindId: wasm.CertificateKind.StakeDelegation,
            payloadHex: payload,
          },
          type: CERT_TYPE.StakeDelegation,
          // TODO: handle DelegationType parsing
          pool_id: poolId != null ? poolId.to_string() : null,
          account: deleg.account().to_hex(),
          isOwnerStake: false,
        }
        common.certificate = parsedCert
        break
      }
      case wasm.CertificateKind.PoolRetirement: {
        const retire = cert.get_pool_retirement()
        const parsedCert: PoolRetirementType = {
          payload: {
            payloadKind: 'PoolRetirement',
            payloadKindId: wasm.CertificateKind.PoolRetirement,
            payloadHex: payload,
          },
          type: CERT_TYPE.PoolRetirement,
          pool_id: retire.pool_id().to_string(),
          // we should be able to do this considering js max int would be 28,5616,414 years
          retirement_time: parseInt(retire.retirement_time().to_string(), 10),
        }
        common.certificate = parsedCert
        break
      }
      case wasm.CertificateKind.PoolUpdate:
        console.log('\n\n\n\n\n========\n\nPOOL UPDATE FOUND\n\n\n')
        break
      case wasm.CertificateKind.OwnerStakeDelegation: {
        if (inputs_parsed.length !== 1 || inputs_parsed[0].type !== 'account') {
          throw new Error(`Malformed OwnerStakeDelegation. Expected 1 account input, found: ${JSON.stringify(inputs_parsed)}`)
        }
        const deleg = cert.get_owner_stake_delegation()
        const poolId = deleg.delegation_type().get_full()
        const parsedCert: StakeDelegationType = {
          payload: {
            payloadKind: 'OwnerStakeDelegation',
            payloadKindId: wasm.CertificateKind.OwnerStakeDelegation,
            payloadHex: payload,
          },
          type: CERT_TYPE.StakeDelegation,
          // TODO: possibly handle Ratio types
          pool_id: poolId != null ? poolId.to_string() : null,
          account: inputs_parsed[0].account_id,
          isOwnerStake: true,
        }
        common.certificate = parsedCert
        break
      }
      default:
        break
        // throw new Error(`parsing certificate type not implemented${cert.get_type()}`)
    }
    cert.free()
  }
  const ret = {
    inputs: inputs_parsed,
    outputs: outputs_parsed,
    witnesses: [],
    ...common,
    ...extraData,
  }
  console.log(`parsed a tx: \n${JSON.stringify(ret)}\n`)
  return ret
}

const getAccountIdFromAddress = (accountAddressHex: string) => {
  const wasm = global.jschainlibs
  let address
  try {
    address = wasm.Address.from_bytes(Buffer.from(accountAddressHex, 'hex'))
  } catch (e) {
    return {
      type: 'unknown',
      comment: 'failed to parse as an address',
    }
  }
  const kind = address.get_kind()
  if (kind === AddressKind.Account) {
    const accountAddress = address.to_account_address()
    const accountKey = accountAddress.get_account_key();
    const result = {
      type: 'account',
      accountId: Buffer.from(accountKey.as_bytes()).toString('hex'),
    }
    accountKey.free()
    accountAddress.free()
    return result
  }
  address.free()
  return {
    type: 'unknown',
    comment: 'unsupported kind (no account id)',
  }
}

const splitGroupAddress = (groupAddressHex: string) => {
  const wasm = global.jschainlibs
  let address
  try {
    address = wasm.Address.from_bytes(Buffer.from(groupAddressHex, 'hex'))
  } catch (e) {
    const prefix = groupAddressHex.substring(0, 3)
    // TODO: find a better way to distinguish legacy funds?
    if (prefix !== 'Ddz' && prefix !== 'Ae2') {
      throw new Error(`Group Metadata could not parse address: ${groupAddressHex}`)
    }
    return {
      type: 'unknown',
      comment: 'failed to parse as an address'
    }
  }
  let result = null
  const kind = address.get_kind()
  if (kind === AddressKind.Group) {
    const groupAddress = address.to_group_address()
    if (groupAddress) {
      const spendingKey = groupAddress.get_spending_key()
      const accountKey = groupAddress.get_account_key()
      const discrim = address.get_discrimination()
      const singleAddress = wasm.Address.single_from_public_key(spendingKey, discrim)
      const accountAddress = wasm.Address.account_from_public_key(accountKey, discrim)
      const metadata = {
        type: 'group',
        groupAddress: groupAddressHex,
        utxoAddress: Buffer.from(singleAddress.as_bytes()).toString('hex'),
        accountAddress: Buffer.from(accountAddress.as_bytes()).toString('hex'),
      }
      singleAddress.free()
      accountAddress.free()
      spendingKey.free()
      accountKey.free()
      groupAddress.free()
      result = metadata
    }
  } else if (kind === AddressKind.Single) {
    result = {
      type: 'utxo',
      utxoAddress: Buffer.from(address.as_bytes()).toString('hex'),
    }
  } else if (kind === AddressKind.Account) {
    result = {
      type: 'account',
      accountAddress: Buffer.from(address.as_bytes()).toString('hex'),
    }
  } else {
    // Unsupported type
    result = {
      type: 'unknown',
      comment: 'unsupported kind'
    }
  }
  address.free()
  return result
}

const rawTxToObj = (tx: Array<any>, networkDiscrimination: number, extraData: {txTime: Date}): ShelleyTxType => {
  const wasm = global.jschainlibs
  return fragmentToObj(wasm.Fragment.from_bytes(tx), networkDiscrimination, extraData)
}

export default {
  rawTxToObj,
  fragmentToObj,
  splitGroupAddress,
  getAccountIdFromAddress,
}
