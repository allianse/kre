// Copyright (c) 2012 Pieter Wuille
// Copyright (c) 2012-2016 The Bitcoin Core developers
// Distributed under the MIT software license, see the accompanying
// file COPYING or http://www.opensource.org/licenses/mit-license.php.

#ifndef BITCOIN_ADDRMAN_H
#define BITCOIN_ADDRMAN_H

#include <fs.h>
#include <logging.h>
#include <netaddress.h>
#include <protocol.h>
#include <sync.h>
#include <timedata.h>

#include <cstdint>
#include <optional>
#include <set>
#include <unordered_map>
#include <vector>

class AddrManImpl;

/** Default for -checkaddrman */
static constexpr int32_t DEFAULT_ADDRMAN_CONSISTENCY_CHECKS{0};

/** Stochastic address manager
 *
 * Design goals:
 *  * Keep the address tables in-memory, and asynchronously dump the entire
 * table to peers.dat.
 *  * Make sure no (localized) attacker can fill the entire table with his
 * nodes/addresses.
 *
 * To that end:
 *  * Addresses are organized into buckets.
 *    * Addresses that have not yet been tried go into 1024 "new" buckets.
 *      * Based on the address range (/16 for IPv4) of the source of
 * information, 64 buckets are selected at random.
 *      * The actual bucket is chosen from one of these, based on the range in
 * which the address itself is located.
 *      * One single address can occur in up to 8 different buckets to increase
 * selection chances for addresses that
 *        are seen frequently. The chance for increasing this multiplicity
 * decreases exponentially.
 *      * When adding a new address to a full bucket, a randomly chosen entry
 * (with a bias favoring less recently seen
 *        ones) is removed from it first.
 *    * Addresses of nodes that are known to be accessible go into 256 "tried"
 * buckets.
 *      * Each address range selects at random 8 of these buckets.
 *      * The actual bucket is chosen from one of these, based on the full
 * address.
 *      * When adding a new good address to a full bucket, a randomly chosen
 * entry (with a bias favoring less recently
 *        tried ones) is evicted from it, back to the "new" buckets.
 *    * Bucket selection is based on cryptographic hashing, using a
 * randomly-generated 256-bit key, which should not
 *      be observable by adversaries.
 *    * Several indexes are kept for high performance. Setting
 * m_consistency_check_ratio with the -checkaddrman configuration option will
 * introduce (expensive) consistency checks for the entire data structure.
 */

/** Total number of buckets for tried addresses */
static constexpr int32_t ADDRMAN_TRIED_BUCKET_COUNT_LOG2{8};
static constexpr int ADDRMAN_TRIED_BUCKET_COUNT{
    1 << ADDRMAN_TRIED_BUCKET_COUNT_LOG2};

/** Total number of buckets for new addresses */
static constexpr int32_t ADDRMAN_NEW_BUCKET_COUNT_LOG2{10};
static constexpr int ADDRMAN_NEW_BUCKET_COUNT{1
                                              << ADDRMAN_NEW_BUCKET_COUNT_LOG2};

/** Maximum allowed number of entries in buckets for new and tried addresses */
static constexpr int32_t ADDRMAN_BUCKET_SIZE_LOG2{6};
static constexpr int ADDRMAN_BUCKET_SIZE{1 << ADDRMAN_BUCKET_SIZE_LOG2};

/**
 * Stochastical (IP) address manager
 */
class CAddrMan {
    const std::unique_ptr<AddrManImpl> m_impl;

public:
    CAddrMan(std::vector<bool> asmap, int32_t consistency_check_ratio);

    ~CAddrMan();

    template <typename Stream> void Serialize(Stream &s_) const;

    template <typename Stream> void Unserialize(Stream &s_);

    //! Return the number of (unique) addresses in all tables.
    size_t size() const;

    //! Add addresses to addrman's new table.
    bool Add(const std::vector<CAddress> &vAddr, const CNetAddr &source,
             int64_t nTimePenalty = 0);

    //! Mark an entry as accessible.
    void Good(const CService &addr, bool test_before_evict = true,
              int64_t nTime = GetAdjustedTime());

    //! Mark an entry as connection attempted to.
    void Attempt(const CService &addr, bool fCountFailure,
                 int64_t nTime = GetAdjustedTime());

    //! See if any to-be-evicted tried table entries have been tested and if so
    //! resolve the collisions.
    void ResolveCollisions();

    /**
     * Randomly select an address in the tried table that another address is
     * attempting to evict.
     *
     * @return CAddress The record for the selected tried peer.
     *         int64_t  The last time we attempted to connect to that peer.
     */
    std::pair<CAddress, int64_t> SelectTriedCollision();

    /**
     * Choose an address to connect to.
     *
     * @param[in] newOnly  Whether to only select addresses from the new table.
     * @return    CAddress The record for the selected peer.
     *            int64_t  The last time we attempted to connect to that peer.
     */
    std::pair<CAddress, int64_t> Select(bool newOnly = false) const;

    /**
     * Return all or many randomly selected addresses, optionally by network.
     *
     * @param[in] max_addresses  Maximum number of addresses to return
     *                           (0 = all).
     * @param[in] max_pct        Maximum percentage of addresses to return
     *                           (0 = all).
     * @param[in] network        Select only addresses of this network
     *                           (nullopt = all).
     */
    std::vector<CAddress> GetAddr(size_t max_addresses, size_t max_pct,
                                  std::optional<Network> network) const;

    //! Outer function for Connected_()
    void Connected(const CService &addr, int64_t nTime = GetAdjustedTime());

    void SetServices(const CService &addr, ServiceFlags nServices);

    const std::vector<bool> &GetAsmap() const;

    void Clear();

    //! Ensure that bucket placement is always the same for testing purposes.
    void MakeDeterministic();

    friend class CAddrManTest;
    friend class CAddrManCorrupted;
};

#endif // BITCOIN_ADDRMAN_H
